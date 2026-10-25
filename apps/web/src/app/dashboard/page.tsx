"use client";

import { useCallback, useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSendTransaction as usePassportSendTransaction } from "@mezo-org/passport";
import { QRCodeSVG } from "qrcode.react";
import { encodeFunctionData, erc20Abi, formatUnits, hashMessage, isAddressEqual, type Address, type Hex } from "viem";
import { useAccount, useBytecode, usePublicClient, useSendTransaction, useSignMessage, useSwitchChain } from "wagmi";
import { mezoTestnet, mezoTestnetAddresses, signInMessage } from "@mezout/sdk";
import { ApiKeyPanel } from "@/components/ApiKeyPanel";
import { OrdersPanel } from "@/components/OrdersPanel";
import { PasskeyAccount } from "@/components/PasskeyAccount";
import { PasskeyOnboarding } from "@/components/PasskeyOnboarding";
import { WebhooksPanel } from "@/components/WebhooksPanel";
import { api, errorText } from "@/lib/api";
import { loadSession, passkeySendMusd, passkeySign, saveSession, type PasskeySession } from "@/lib/passkey";

type Created = { url: string; orderId: string; expiry: string };

export default function Dashboard() {
  const { address: walletAddress, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();
  const { sendTransaction: passportSend } = usePassportSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const client = usePublicClient({ chainId: mezoTestnet.id });
  const [passkey, setPasskey] = useState<PasskeySession | null>(null);
  useEffect(() => setPasskey(loadSession()), []);
  // A passkey account takes precedence over a connected wallet; signing out of it falls back to the wallet.
  const address = passkey?.address ?? walletAddress;
  const { data: code } = useBytecode({ address: passkey ? undefined : walletAddress, chainId: mezoTestnet.id });
  const isSmartAccount = !!code && code !== "0x";

  // The server session (an HttpOnly cookie). undefined while checking.
  const [signedIn, setSignedIn] = useState<Address | null | undefined>(undefined);
  useEffect(() => {
    api<{ merchant: Address }>("/api/session")
      .then((r) => setSignedIn(r.merchant))
      .catch(() => setSignedIn(null));
  }, []);
  const active = !!address && !!signedIn && isAddressEqual(signedIn, address);

  const signMessage = (message: string) =>
    passkey ? passkeySign(passkey, hashMessage(message)) : signMessageAsync({ message });

  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  async function signIn() {
    if (!address) return;
    setSignInBusy(true);
    setSignInError(null);
    try {
      const issuedAt = new Date().toISOString();
      const signature = await signMessage(signInMessage(address, issuedAt));
      const r = await api<{ merchant: Address }>("/api/session", { body: { address, issuedAt, signature } });
      setSignedIn(r.merchant);
    } catch (err) {
      setSignInError(errorText(err, "Could not sign in"));
    } finally {
      setSignInBusy(false);
    }
  }

  async function signOut() {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    setSignedIn(null);
    if (passkey) {
      saveSession(null);
      setPasskey(null);
    }
  }

  const setPasskeySession = (next: PasskeySession | null) => {
    saveSession(next);
    setPasskey(next);
  };

  // Refunds: MUSD from the payout address to the customer, sent by whichever account the merchant uses.
  const sendMusd = useCallback(
    async (to: Address, amount: bigint): Promise<Hex> => {
      if (!client) throw new Error("Mezo testnet is not reachable");
      if (passkey) return passkeySendMusd(passkey, to, formatUnits(amount, 18), (hash) => client.waitForTransactionReceipt({ hash, timeout: 90_000 }));
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
      let hash: Hex;
      if (isSmartAccount) {
        const result = await passportSend(mezoTestnetAddresses.musd, 0n, data);
        if (!result?.hash) throw new Error("The wallet did not send the transfer");
        hash = result.hash as Hex;
      } else {
        if (chainId !== mezoTestnet.id) await switchChainAsync({ chainId: mezoTestnet.id });
        hash = await sendTransactionAsync({ to: mezoTestnetAddresses.musd, data, chainId: mezoTestnet.id });
      }
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 90_000 });
      if (receipt.status !== "success") throw new Error("The transfer failed on-chain. Nothing was sent.");
      return hash;
    },
    [client, passkey, isSmartAccount, passportSend, chainId, switchChainAsync, sendTransactionAsync],
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Merchant dashboard</h1>
        <div className="flex items-center gap-2">
          {active && !passkey && (
            <button onClick={signOut} className="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100">
              Sign out
            </button>
          )}
          {!passkey && <ConnectButton showBalance={false} />}
        </div>
      </div>

      {passkey && <PasskeyAccount session={passkey} onSignOut={signOut} />}

      {!address ? (
        <PasskeyOnboarding onSession={setPasskeySession} />
      ) : signedIn === undefined ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : !active ? (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Sign in</h2>
          <p className="break-all text-sm text-stone-600">
            Confirm with your {passkey ? "passkey" : "wallet"} that you control{" "}
            <span className="font-mono">{address}</span>. This signs a message and costs no gas.
          </p>
          <button
            onClick={signIn}
            disabled={signInBusy}
            className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {signInBusy ? "Waiting for signature…" : "Sign in"}
          </button>
          {signInError && <p className="text-sm text-red-700">{signInError}</p>}
        </div>
      ) : (
        <>
          <PaymentLinkForm address={address} />
          <OrdersPanel sendMusd={sendMusd} />
          <WebhooksPanel />
          <ApiKeyPanel />
        </>
      )}
    </div>
  );
}

function PaymentLinkForm({ address }: { address: Address }) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCreated(await api<Created>("/api/invoices", { body: { amount, reference: reference || undefined } }));
      setAmount("");
      setReference("");
    } catch (err) {
      setError(errorText(err, "Could not create the link"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={create} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Payment link</h2>
        <p className="break-all text-sm text-stone-600">
          Payout address <span className="font-mono">{address}</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Amount (MUSD)</span>
            <input
              required
              inputMode="decimal"
              pattern="^\d+(\.\d{1,18})?$"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2"
              placeholder="25.00"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Reference (optional)</span>
            <input
              maxLength={200}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2"
              placeholder="Order 1001"
            />
          </label>
        </div>
        <p className="text-xs text-stone-500">Links expire after 24 hours. Platform fee: 0% during the buildathon.</p>
        <button
          disabled={busy}
          className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create link"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>

      {created && (
        <div className="flex flex-col gap-6 rounded-xl border border-stone-200 bg-white p-6 sm:flex-row">
          <QRCodeSVG value={created.url} size={160} />
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium">Share this link or QR code with your customer</p>
            <a href={created.url} className="block break-all font-mono text-xs text-blue-700 underline">
              {created.url}
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(created.url)}
              className="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
            >
              Copy link
            </button>
            <p className="text-xs text-stone-500">Expires {new Date(Number(created.expiry) * 1000).toLocaleString()}</p>
          </div>
        </div>
      )}
    </>
  );
}
