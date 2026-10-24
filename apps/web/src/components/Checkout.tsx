"use client";

import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useSendTransaction } from "@mezo-org/passport";
import { encodeFunctionData, formatUnits, parseSignature, zeroHash, type Address, type Hex } from "viem";
import { useAccount, useBytecode, usePublicClient, useReadContract, useSignTypedData } from "wagmi";
import {
  borrowerOperationsSignaturesAbi,
  borrowerOperationsSignaturesDomain,
  decodeSignedInvoice,
  mezoTestnetAddresses,
  mezoutRouterAbi,
  musdAbi,
  musdDomain,
  paymentTypes,
  permitTypes,
  quoteBorrow,
  routerDomain,
  withdrawMusdTypes,
} from "@mezout/sdk";
import { routerAddress, txUrl } from "@/lib/config";

const QUOTE_TTL_MS = 60_000;
const SIG_TTL_S = 10n * 60n;
const noPermit = { deadline: "0", v: 0, r: zeroHash, s: zeroHash };

const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (v: bigint) => `${Number(formatUnits(v * 100n, 18)).toFixed(0)}%`;
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Status = { kind: "idle" } | { kind: "working"; step: string } | { kind: "sent"; hash: Hex } | { kind: "error"; message: string };

export function Checkout({ token }: { token: string }) {
  const signed = useMemo(() => {
    try {
      return decodeSignedInvoice(token);
    } catch {
      return null;
    }
  }, [token]);

  if (!signed) return <p className="text-red-700">This payment link is not valid.</p>;
  return <CheckoutInner token={token} invoice={signed.invoice} invoiceSig={signed.signature} />;
}

type SignedInvoice = ReturnType<typeof decodeSignedInvoice>;

function CheckoutInner({
  token,
  invoice,
  invoiceSig,
}: {
  token: string;
  invoice: SignedInvoice["invoice"];
  invoiceSig: SignedInvoice["signature"];
}) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransaction } = useSendTransaction();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [useBalanceFirst, setUseBalanceFirst] = useState(true);

  const { data: code } = useBytecode({ address });
  const isSmartAccount = !!code && code !== "0x";

  const { data: paid, refetch: refetchPaid } = useReadContract({
    address: routerAddress,
    abi: mezoutRouterAbi,
    functionName: "paid",
    args: [invoice.orderId],
    query: { refetchInterval: 4_000 },
  });
  const { data: balance = 0n } = useReadContract({
    address: mezoTestnetAddresses.musd,
    abi: musdAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const expired = Date.now() / 1000 > Number(invoice.expiry);
  const partialBalance = balance > 0n && balance < invoice.amount;
  const fromBalance = useBalanceFirst && partialBalance ? balance : 0n;
  const borrowed = invoice.amount - fromBalance;

  const quote = useQuery({
    queryKey: ["borrow-quote", address, borrowed.toString()],
    queryFn: () => quoteBorrow(client!, address as Address, borrowed),
    enabled: !!address && !!client && !isSmartAccount,
    refetchInterval: QUOTE_TTL_MS,
  });

  const canPayMusd = balance >= invoice.amount;
  const canBorrow = !isSmartAccount && !!quote.data?.canBorrow;

  async function splitPermit(owner: Address, value: bigint) {
    const nonce = await client!.readContract({ address: mezoTestnetAddresses.musd, abi: musdAbi, functionName: "nonces", args: [owner] });
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + SIG_TTL_S;
    const sig = await signTypedDataAsync({
      domain: musdDomain(),
      types: permitTypes,
      primaryType: "Permit",
      message: { owner, spender: routerAddress, value, nonce, deadline },
    });
    const { r, s, v, yParity } = parseSignature(sig);
    return { deadline: deadline.toString(), v: Number(v ?? BigInt(yParity + 27)), r, s };
  }

  async function signPayment(payer: Address) {
    return signTypedDataAsync({
      domain: routerDomain(routerAddress),
      types: paymentTypes,
      primaryType: "Payment",
      message: { invoice, payer },
    });
  }

  async function relay(body: object) {
    const res = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "The payment could not be sent");
    return json.hash as Hex;
  }

  async function finish(hash: Hex) {
    setStatus({ kind: "sent", hash });
    await client!.waitForTransactionReceipt({ hash });
    await refetchPaid();
  }

  async function payWithMusd() {
    if (!address) return;
    try {
      if (isSmartAccount) {
        // Bitcoin-wallet smart accounts cannot sign MUSD permits, so they approve and pay directly.
        setStatus({ kind: "working", step: "Approve MUSD in your wallet" });
        await sendTransaction(
          mezoTestnetAddresses.musd,
          0n,
          encodeFunctionData({ abi: musdAbi, functionName: "approve", args: [routerAddress, invoice.amount] }),
        );
        setStatus({ kind: "working", step: "Confirm the payment in your wallet" });
        const result = await sendTransaction(
          routerAddress,
          0n,
          encodeFunctionData({
            abi: mezoutRouterAbi,
            functionName: "payWithMUSD",
            args: [invoice, invoiceSig, address, "0x", { deadline: 0n, v: 0, r: zeroHash, s: zeroHash }],
          }),
        );
        if (result?.hash) await finish(result.hash);
        return;
      }
      setStatus({ kind: "working", step: "Sign the payment (1 of 2)" });
      const payerSig = await signPayment(address);
      setStatus({ kind: "working", step: "Sign the MUSD permit (2 of 2)" });
      const permit = await splitPermit(address, invoice.amount);
      setStatus({ kind: "working", step: "Sending" });
      await finish(await relay({ method: "MUSD", token, payer: address, payerSig, permit }));
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  }

  async function payWithBorrow() {
    if (!address) return;
    try {
      if (!quote.data || Date.now() - quote.dataUpdatedAt > QUOTE_TTL_MS) {
        setStatus({ kind: "working", step: "Refreshing the quote" });
        const fresh = await quote.refetch();
        if (!fresh.data?.canBorrow) throw new Error("This borrow is no longer possible at the current price");
      }
      setStatus({ kind: "working", step: `Sign the payment (1 of ${fromBalance > 0n ? 3 : 2})` });
      const payerSig = await signPayment(address);
      const permit = fromBalance > 0n ? await splitPermitStep(address, fromBalance) : noPermit;
      setStatus({ kind: "working", step: "Sign the borrow authorization" });
      const nonce = await client!.readContract({
        address: mezoTestnetAddresses.borrowerOperationsSignatures,
        abi: borrowerOperationsSignaturesAbi,
        functionName: "getNonce",
        args: [address],
      });
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + SIG_TTL_S;
      const signature = await signTypedDataAsync({
        domain: borrowerOperationsSignaturesDomain(),
        types: withdrawMusdTypes,
        primaryType: "WithdrawMUSD",
        message: { amount: borrowed, borrower: address, recipient: routerAddress, nonce, deadline },
      });
      setStatus({ kind: "working", step: "Sending" });
      await finish(
        await relay({
          method: "BORROW",
          token,
          payer: address,
          payerSig,
          fromBalance: fromBalance.toString(),
          permit,
          borrow: { deadline: deadline.toString(), signature },
        }),
      );
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  }

  async function splitPermitStep(owner: Address, value: bigint) {
    setStatus({ kind: "working", step: "Sign the MUSD permit" });
    return splitPermit(owner, value);
  }

  const busy = status.kind === "working" || (status.kind === "sent" && !paid);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <p className="text-sm text-stone-500">Pay {shortAddr(invoice.merchant)}</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight">{fmt(invoice.amount)} MUSD</p>
        <p className="mt-2 text-xs text-stone-500">
          {expired ? "Expired" : `Expires ${new Date(Number(invoice.expiry) * 1000).toLocaleString()}`}
        </p>
      </div>

      {paid ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-green-900">
          <p className="font-medium">Paid</p>
          {status.kind === "sent" && (
            <a href={txUrl(status.hash)} target="_blank" rel="noreferrer" className="text-sm underline">
              View transaction
            </a>
          )}
        </div>
      ) : expired ? (
        <p className="text-stone-600">This link has expired. Ask the merchant for a new one.</p>
      ) : !address ? (
        <div className="space-y-3">
          <p className="text-stone-600">Connect a Bitcoin wallet (Xverse, Unisat, OKX) or an EVM wallet to pay.</p>
          <ConnectButton />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-stone-600">
            <span>MUSD balance: {fmt(balance)}</span>
            <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
          </div>

          <button
            disabled={!canPayMusd || busy}
            onClick={payWithMusd}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-left text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="block font-medium">Pay with MUSD</span>
            <span className="block text-xs text-stone-300">
              {canPayMusd
                ? isSmartAccount
                  ? "Two transactions from your wallet; you pay the network fee"
                  : "Two signatures, no network fee"
                : "Not enough MUSD"}
            </span>
          </button>

          {!isSmartAccount && (
            <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-4">
              <button
                disabled={!canBorrow || busy}
                onClick={payWithBorrow}
                className="w-full rounded-lg bg-orange-600 px-4 py-3 text-left text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="block font-medium">Borrow against my BTC</span>
                <span className="block text-xs text-orange-100">
                  Borrow {fmt(borrowed)} MUSD{fromBalance > 0n ? ` + ${fmt(fromBalance)} from balance` : ""}, no network fee
                </span>
              </button>
              {partialBalance && (
                <label className="flex items-center gap-2 text-xs text-stone-600">
                  <input type="checkbox" checked={useBalanceFirst} onChange={(e) => setUseBalanceFirst(e.target.checked)} />
                  Use my MUSD balance first
                </label>
              )}
              <BorrowDetails quote={quote.data} loading={quote.isLoading} />
            </div>
          )}
          {isSmartAccount && (
            <p className="text-xs text-stone-500">
              Borrow-to-pay needs an EVM wallet for now; Bitcoin-wallet support is coming.
            </p>
          )}

          {status.kind === "working" && <p className="text-sm text-stone-600">{status.step}…</p>}
          {status.kind === "sent" && !paid && (
            <p className="text-sm text-stone-600">
              Waiting for confirmation…{" "}
              <a href={txUrl(status.hash)} target="_blank" rel="noreferrer" className="underline">
                transaction
              </a>
            </p>
          )}
          {status.kind === "error" && <p className="text-sm text-red-700">{status.message}</p>}
        </div>
      )}
    </div>
  );
}

function BorrowDetails({ quote, loading }: { quote?: Awaited<ReturnType<typeof quoteBorrow>>; loading: boolean }) {
  if (loading) return <p className="text-xs text-stone-500">Checking your loan…</p>;
  if (!quote) return null;
  if (!quote.active) return <p className="text-xs text-stone-500">No MUSD loan found for this wallet.</p>;
  if (quote.recoveryMode) return <p className="text-xs text-stone-500">Borrowing is paused while Mezo is in Recovery Mode.</p>;
  return (
    <dl className="grid grid-cols-2 gap-y-1 text-xs text-stone-600">
      <dt>Collateral ratio</dt>
      <dd className="text-right">
        {pct(quote.icrBefore)} → <span className={quote.canBorrow ? "" : "text-red-700"}>{pct(quote.icrAfter)}</span>
      </dd>
      <dt>Borrowing fee (0.1%)</dt>
      <dd className="text-right">{fmt(quote.borrowFee)} MUSD, added to your loan</dd>
      <dt>BTC price</dt>
      <dd className="text-right">${fmt(quote.price)}</dd>
      {!quote.canBorrow && (
        <dd className="col-span-2 text-red-700">This would take your loan below the 160% safety floor or its borrowing limit.</dd>
      )}
    </dl>
  );
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "shortMessage" in err) return String((err as { shortMessage: string }).shortMessage);
  return err instanceof Error ? err.message : "Something went wrong";
}
