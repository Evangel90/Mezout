"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSendTransaction as usePassportSendTransaction } from "@mezo-org/passport";
import { encodeFunctionData, erc20Abi, formatUnits, hashMessage, isAddressEqual, type Address, type Hex } from "viem";
import { useAccount, useBytecode, useDisconnect, usePublicClient, useSendTransaction, useSignMessage, useSwitchChain } from "wagmi";
import { mezoTestnet, mezoTestnetAddresses, signInMessage } from "@mezout/sdk";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SignInChoice } from "@/components/dashboard/SignInChoice";
import { api, errorText } from "@/lib/api";
import { MerchantContext, type Merchant } from "@/lib/merchant";
import { loadSession, passkeySendMusd, passkeySign, saveSession, type PasskeySession } from "@/lib/passkey";

type Session = { merchant: Address; business_name: string | null };

/**
 * Signs the merchant in, with either a passkey account or a wallet (never both), and provides the signed-in merchant
 * to the dashboard pages. Signing in is a signed message that the server turns into an HttpOnly session cookie.
 */
export function MerchantGate({ children }: { children: ReactNode }) {
  const { address: walletAddress, chainId } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();
  const { sendTransaction: passportSend } = usePassportSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const client = usePublicClient({ chainId: mezoTestnet.id });

  const [passkey, setPasskey] = useState<PasskeySession | null>(null);
  useEffect(() => setPasskey(loadSession()), []);
  const { data: code } = useBytecode({ address: walletAddress, chainId: mezoTestnet.id });
  const isSmartAccount = !!code && code !== "0x";

  // The server session's merchant. undefined while checking.
  const [signedIn, setSignedIn] = useState<Address | null | undefined>(undefined);
  const [businessName, setBusinessNameState] = useState<string | null>(null);
  useEffect(() => {
    api<Session>("/api/session")
      .then((r) => {
        setSignedIn(r.merchant);
        setBusinessNameState(r.business_name);
      })
      .catch(() => setSignedIn(null));
  }, []);

  const setBusinessName = useCallback(async (name: string) => {
    const r = await api<{ business_name: string | null }>("/api/dashboard/profile", {
      method: "PUT",
      body: { business_name: name },
    });
    setBusinessNameState(r.business_name);
    return r.business_name;
  }, []);

  const method =
    signedIn && passkey && isAddressEqual(signedIn, passkey.address)
      ? "passkey"
      : signedIn && walletAddress && isAddressEqual(signedIn, walletAddress)
        ? "wallet"
        : null;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startSession(address: Address, sign: (message: string) => Promise<Hex>) {
    const issuedAt = new Date().toISOString();
    const signature = await sign(signInMessage(address, issuedAt));
    const r = await api<Session>("/api/session", { body: { address, issuedAt, signature } });
    setSignedIn(r.merchant);
    setBusinessNameState(r.business_name);
    return r;
  }

  /**
   * A passkey account was created or chosen: sign in with it right away, and drop any connected wallet. A new account
   * brings the business name it was created with, which becomes its checkout name unless one is already set.
   */
  async function signInWithPasskeySession(session: PasskeySession, newName?: string) {
    saveSession(session);
    setPasskey(session);
    setError(null);
    setBusy("Confirm with your passkey to sign in");
    try {
      const r = await startSession(session.address, (message) => passkeySign(session, hashMessage(message)));
      if (newName?.trim() && !r.business_name) await setBusinessName(newName).catch(() => {});
      if (walletAddress) await disconnectAsync().catch(() => {});
    } catch (err) {
      setError(errorText(err, "Could not sign in. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  /** Signs in with the connected wallet, and forgets any passkey account on this device's dashboard. */
  async function signInWithWallet() {
    if (!walletAddress) return;
    setError(null);
    setBusy("Sign the message in your wallet");
    try {
      await startSession(walletAddress, (message) => signMessageAsync({ message }));
      saveSession(null);
      setPasskey(null);
    } catch (err) {
      setError(errorText(err, "Could not sign in. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  // The passkey account stays remembered on this device (only its public address and key), so signing back in is one
  // tap; the passkey itself is still needed. "Create a new account instead" forgets it.
  const signOut = useCallback(async () => {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    setSignedIn(null);
    if (walletAddress) await disconnectAsync().catch(() => {});
  }, [walletAddress, disconnectAsync]);

  const sendMusd = useCallback(
    async (to: Address, amount: bigint): Promise<Hex> => {
      if (!client) throw new Error("Mezo testnet is not reachable");
      if (method === "passkey" && passkey) {
        return passkeySendMusd(passkey, to, formatUnits(amount, 18), (hash) => client.waitForTransactionReceipt({ hash, timeout: 90_000 }));
      }
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
      let hash: Hex;
      if (isSmartAccount) {
        const result = await passportSend(mezoTestnetAddresses.musd, 0n, data);
        if (!result?.hash) throw new Error("The wallet did not send the transfer");
        hash = result.hash as Hex;
      } else {
        if (chainId !== mezoTestnet.id) await switchChainAsync({ chainId: mezoTestnet.id });
        // Mezo testnet's gas estimate for a transfer is sometimes below its own minimum (EIP-7623's calldata floor),
        // which the node then rejects. An MUSD transfer uses about 35,000 gas; unused gas is not charged.
        hash = await sendTransactionAsync({ to: mezoTestnetAddresses.musd, data, chainId: mezoTestnet.id, gas: 80_000n });
      }
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 90_000 });
      if (receipt.status !== "success") throw new Error("The transfer failed on-chain. Nothing was sent.");
      return hash;
    },
    [client, method, passkey, isSmartAccount, passportSend, chainId, switchChainAsync, sendTransactionAsync],
  );

  const merchant = useMemo<Merchant | null>(
    () =>
      method && signedIn
        ? { address: signedIn, method, passkey: method === "passkey" ? passkey : null, businessName, setBusinessName, sendMusd, signOut }
        : null,
    [method, signedIn, passkey, businessName, setBusinessName, sendMusd, signOut],
  );

  if (signedIn === undefined) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!merchant) {
    return (
      <SignInChoice
        savedPasskey={passkey}
        walletAddress={walletAddress ?? null}
        busy={busy}
        error={error}
        onPasskeySession={signInWithPasskeySession}
        onForgetPasskey={() => {
          saveSession(null);
          setPasskey(null);
        }}
        onWalletSignIn={signInWithWallet}
        onWalletDisconnect={() => disconnectAsync().catch(() => {})}
        onError={setError}
      />
    );
  }
  return (
    <MerchantContext.Provider value={merchant}>
      <DashboardShell>{children}</DashboardShell>
    </MerchantContext.Provider>
  );
}
