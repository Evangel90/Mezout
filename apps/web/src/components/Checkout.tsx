"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useSendTransaction } from "@mezo-org/passport";
import { encodeFunctionData, formatUnits, isAddressEqual, parseSignature, zeroHash, type Address, type Hex } from "viem";
import { useAccount, useBytecode, usePublicClient, useReadContract, useSignTypedData } from "wagmi";
import {
  borrowerOperationsSignaturesAbi,
  borrowerOperationsSignaturesDomain,
  btcDomain,
  decodeSignedInvoice,
  getTroveSnapshot,
  linkRouter,
  mezoDomain,
  mezoTestnetAddresses,
  mezoutRouterAbi,
  musdAbi,
  musdDomain,
  paymentTypes,
  permitTypes,
  quoteBorrow,
  routerDomain,
  swapPaymentTypes,
  troveRisk,
  withdrawMusdTypes,
} from "@mezout/sdk";
import { routerAddress as currentRouter, txUrl } from "@/lib/config";

const QUOTE_TTL_MS = 60_000;
const SWAP_QUOTE_TTL_MS = 15_000;
const SIG_TTL_S = 10n * 60n;
const SWAP_TTL_S = 5n * 60n;
// The payer signs for the quote plus 1%; the router takes only what the pool needs when the payment lands.
const SLIPPAGE_BPS = 100n;
// Left in a Bitcoin-wallet account that pays its own network fee; Mezo testnet fees are far below this.
const BTC_GAS_RESERVE = 10n ** 12n;

const SWAP_TOKENS = {
  BTC: { address: mezoTestnetAddresses.btcToken, domain: btcDomain },
  MEZO: { address: mezoTestnetAddresses.mezoToken, domain: mezoDomain },
} as const;
type SwapMethod = keyof typeof SWAP_TOKENS;

const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtToken = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumSignificantDigits: 4 });
const withSlippage = (v: bigint) => (v * (10_000n + SLIPPAGE_BPS)) / 10_000n;
const pct = (v: bigint) => `${Number(formatUnits(v * 100n, 18)).toFixed(0)}%`;
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/** "23 hours", "12 minutes", "3 days": how long until a unix-seconds expiry. */
function timeLeft(expiry: bigint, now = Date.now()) {
  const minutes = Math.max(1, Math.round((Number(expiry) * 1000 - now) / 60_000));
  const [n, unit] = minutes < 60 ? [minutes, "minute"] : minutes < 48 * 60 ? [Math.round(minutes / 60), "hour"] : [Math.round(minutes / 1440), "day"];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

type Status = { kind: "idle" } | { kind: "working"; step: string } | { kind: "sent"; hash: Hex } | { kind: "error"; message: string };

// successUrl: where the merchant asked to send the customer after paying (validated as http(s) when the invoice was made).
type Display = {
  businessName: string | null;
  reference: string | null;
  successUrl: string | null;
  embedded: boolean;
  embedOrigins: string[];
};

export function Checkout({ token, businessName, reference, successUrl, embedded, embedOrigins }: { token: string } & Display) {
  const signed = useMemo(() => {
    try {
      return decodeSignedInvoice(token);
    } catch {
      return null;
    }
  }, [token]);

  if (!signed) {
    return (
      <div role="alert" className="mx-auto max-w-md space-y-1 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="font-semibold text-stone-900">This payment link is not valid</h1>
        <p className="text-sm text-stone-600">Check that it was copied in full, or ask the merchant to send it again.</p>
      </div>
    );
  }
  return (
    <CheckoutInner
      token={token}
      invoice={signed.invoice}
      invoiceSig={signed.signature}
      router={linkRouter(signed)}
      businessName={businessName}
      reference={reference}
      successUrl={successUrl}
      embedded={embedded}
      embedOrigins={embedOrigins}
    />
  );
}

type SignedInvoice = ReturnType<typeof decodeSignedInvoice>;

function CheckoutInner({
  token,
  invoice,
  invoiceSig,
  router,
  businessName,
  reference,
  successUrl,
  embedded,
  embedOrigins,
}: {
  token: string;
  invoice: SignedInvoice["invoice"];
  invoiceSig: SignedInvoice["signature"];
  router: Address;
} & Display) {
  // Links signed for an earlier router can only be paid with MUSD. Swaps need v2 or later, and v1/v2 borrows expect
  // the router as the borrow recipient, which this checkout no longer signs.
  const isCurrentRouter = isAddressEqual(router, currentRouter);
  const supportsSwaps = isCurrentRouter;
  const { address } = useAccount();
  const client = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransaction } = useSendTransaction();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [useBalanceFirst, setUseBalanceFirst] = useState(true);
  const [borrowedToPay, setBorrowedToPay] = useState(false);
  const paidMessageSent = useRef(false);

  const { data: code } = useBytecode({ address });
  const isSmartAccount = !!code && code !== "0x";

  const { data: paid, refetch: refetchPaid } = useReadContract({
    address: router,
    abi: mezoutRouterAbi,
    functionName: "paid",
    args: [invoice.orderId],
    query: { refetchInterval: 4_000 },
  });

  const embedTarget = useMemo(() => {
    if (!embedded || typeof document === "undefined" || !document.referrer) return null;
    try {
      const origin = new URL(document.referrer).origin;
      return embedOrigins.includes(origin) ? origin : null;
    } catch {
      return null;
    }
  }, [embedded, embedOrigins]);

  useEffect(() => {
    if (!paid || paidMessageSent.current || !embedTarget) return;
    const target = window.parent !== window ? window.parent : window.opener;
    if (!target) return;
    target.postMessage(
      { type: "mezout:paid", orderId: invoice.orderId, txHash: status.kind === "sent" ? status.hash : null },
      embedTarget,
    );
    paidMessageSent.current = true;
  }, [paid, embedTarget, invoice.orderId, status]);

  function closeEmbeddedCheckout() {
    if (embedTarget) {
      const target = window.parent !== window ? window.parent : window.opener;
      target?.postMessage({ type: "mezout:closed", orderId: invoice.orderId }, embedTarget);
    }
    if (window.opener) window.close();
  }
  const { data: balance = 0n } = useReadContract({
    address: mezoTestnetAddresses.musd,
    abi: musdAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const swapBalances = useQuery({
    queryKey: ["swap-balances", address],
    queryFn: async () => {
      const read = (token: Address) =>
        client!.readContract({ address: token, abi: musdAbi, functionName: "balanceOf", args: [address as Address] });
      const [btc, mezo] = await Promise.all([read(SWAP_TOKENS.BTC.address), read(SWAP_TOKENS.MEZO.address)]);
      return { BTC: btc, MEZO: mezo };
    },
    enabled: !!address && !!client && supportsSwaps,
    refetchInterval: SWAP_QUOTE_TTL_MS,
  });
  // The input each swap needs right now, or null when there is no pool or not enough liquidity.
  const swapQuotes = useQuery({
    queryKey: ["swap-quotes", router, invoice.amount.toString()],
    queryFn: async () => {
      const quoteFor = (token: Address) =>
        client!
          .readContract({ address: router, abi: mezoutRouterAbi, functionName: "quoteSwapIn", args: [token, invoice.amount] })
          .catch(() => null);
      const [btc, mezo] = await Promise.all([quoteFor(SWAP_TOKENS.BTC.address), quoteFor(SWAP_TOKENS.MEZO.address)]);
      return { BTC: btc, MEZO: mezo };
    },
    enabled: !!address && !!client && supportsSwaps,
    refetchInterval: SWAP_QUOTE_TTL_MS,
  });
  const canSwap = (method: SwapMethod) => {
    const quoted = swapQuotes.data?.[method];
    const held = swapBalances.data?.[method];
    if (quoted == null || held === undefined) return false;
    const reserve = method === "BTC" && isSmartAccount ? BTC_GAS_RESERVE : 0n;
    return held >= withSlippage(quoted) + reserve;
  };

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
  const canBorrow = isCurrentRouter && !isSmartAccount && !!quote.data?.canBorrow;
  // This starts only after the borrow payment has been confirmed. It is advisory
  // monitoring, never an authorization to move collateral or repay debt.
  const followUp = useQuery({
    queryKey: ["trove-follow-up", address],
    queryFn: () => getTroveSnapshot(client!, address as Address),
    enabled: borrowedToPay && !!paid && !!address && !!client,
    refetchInterval: 60_000,
  });

  async function splitPermit(owner: Address, value: bigint) {
    const nonce = await client!.readContract({ address: mezoTestnetAddresses.musd, abi: musdAbi, functionName: "nonces", args: [owner] });
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + SIG_TTL_S;
    const sig = await signTypedDataAsync({
      domain: musdDomain(),
      types: permitTypes,
      primaryType: "Permit",
      message: { owner, spender: router, value, nonce, deadline },
    });
    return splitSig(sig, deadline);
  }

  async function signPayment(payer: Address) {
    return signTypedDataAsync({
      domain: routerDomain(router),
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
    const receipt = await client!.waitForTransactionReceipt({ hash });
    await refetchPaid();
    // Tell Mezout to index the payment now, so the merchant's webhook fires in seconds.
    fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ block: receipt.blockNumber.toString() }),
    }).catch(() => {});
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
          encodeFunctionData({ abi: musdAbi, functionName: "approve", args: [router, invoice.amount] }),
        );
        setStatus({ kind: "working", step: "Confirm the payment in your wallet" });
        const result = await sendTransaction(
          router,
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
      setStatus({ kind: "working", step: "Sign the payment (1 of 3)" });
      const payerSig = await signPayment(address);
      const permit = await splitPermitStep(address, invoice.amount);
      setStatus({ kind: "working", step: "Sign the borrow authorization (3 of 3)" });
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
        message: { amount: borrowed, borrower: address, recipient: address, nonce, deadline },
      });
      setStatus({ kind: "working", step: "Sending" });
      const hash = await relay({
        method: "BORROW",
        token,
        payer: address,
        payerSig,
        fromBalance: fromBalance.toString(),
        permit,
        borrow: { deadline: deadline.toString(), signature },
      });
      setBorrowedToPay(true);
      await finish(hash);
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  }

  async function payWithSwap(method: SwapMethod) {
    if (!address) return;
    const tokenIn = SWAP_TOKENS[method];
    try {
      setStatus({ kind: "working", step: "Getting the latest price" });
      const fresh = await swapQuotes.refetch();
      const quoted = fresh.data?.[method];
      if (quoted == null) throw new Error(`${method} cannot be swapped to MUSD right now`);
      const limit = {
        maxAmountIn: withSlippage(quoted),
        deadline: BigInt(Math.floor(Date.now() / 1000)) + SWAP_TTL_S,
      };
      const functionName = method === "MEZO" ? "payWithMEZO" : "payWithBTC";

      if (isSmartAccount) {
        // Bitcoin-wallet smart accounts cannot sign token permits, so they approve and pay directly.
        setStatus({ kind: "working", step: `Approve ${method} in your wallet` });
        await sendTransaction(
          tokenIn.address,
          0n,
          encodeFunctionData({ abi: musdAbi, functionName: "approve", args: [router, limit.maxAmountIn] }),
        );
        setStatus({ kind: "working", step: "Confirm the payment in your wallet" });
        const result = await sendTransaction(
          router,
          0n,
          encodeFunctionData({
            abi: mezoutRouterAbi,
            functionName,
            args: [invoice, invoiceSig, address, "0x", limit, { deadline: 0n, v: 0, r: zeroHash, s: zeroHash }],
          }),
        );
        if (result?.hash) await finish(result.hash);
        return;
      }

      setStatus({ kind: "working", step: "Sign the payment (1 of 2)" });
      const payerSig = await signTypedDataAsync({
        domain: routerDomain(router),
        types: swapPaymentTypes,
        primaryType: "SwapPayment",
        message: { invoice, payer: address, tokenIn: tokenIn.address, ...limit },
      });
      setStatus({ kind: "working", step: `Sign the ${method} permit (2 of 2)` });
      const nonce = await client!.readContract({ address: tokenIn.address, abi: musdAbi, functionName: "nonces", args: [address] });
      const permitDeadline = BigInt(Math.floor(Date.now() / 1000)) + SIG_TTL_S;
      const permitSig = await signTypedDataAsync({
        domain: tokenIn.domain(),
        types: permitTypes,
        primaryType: "Permit",
        message: { owner: address, spender: router, value: limit.maxAmountIn, nonce, deadline: permitDeadline },
      });
      setStatus({ kind: "working", step: "Sending" });
      await finish(
        await relay({
          method,
          token,
          payer: address,
          payerSig,
          limit: { maxAmountIn: limit.maxAmountIn.toString(), deadline: limit.deadline.toString() },
          permit: splitSig(permitSig, permitDeadline),
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
  const hasOption = canPayMusd || canSwap("BTC") || canSwap("MEZO") || (!isSmartAccount && !!quote.data?.active);
  const checking =
    !hasOption &&
    ((!isSmartAccount && quote.isLoading) || (supportsSwaps && (swapQuotes.isLoading || swapBalances.isLoading)));

  const merchantName = businessName ?? shortAddr(invoice.merchant);
  const fee = isSmartAccount ? "You pay the network fee" : "No network fee";

  return (
    <div className="mx-auto max-w-md space-y-4 pb-6">
      <section aria-label="Payment summary" className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold uppercase text-white">
              {businessName ? businessName.trim().charAt(0) : "M"}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-stone-500">Pay</p>
              <h1 className="truncate font-semibold leading-tight text-stone-900">{merchantName}</h1>
              {businessName && <p className="font-mono text-xs text-stone-500">{shortAddr(invoice.merchant)}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-4xl font-semibold tracking-tight tabular-nums text-stone-900">
              {fmt(invoice.amount)} <span className="text-xl font-medium text-stone-500">MUSD</span>
            </p>
            {reference && <p className="text-sm text-stone-600">{reference}</p>}
            {invoice.fee > 0n && (
              <p className="text-xs text-stone-500">You pay exactly this amount. The merchant&apos;s platform fee comes out of their settlement.</p>
            )}
          </div>
          {!paid && (
            <p
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${expired ? "bg-stone-100 text-stone-600" : "bg-amber-50 text-amber-900"}`}
              title={new Date(Number(invoice.expiry) * 1000).toLocaleString()}
            >
              <ClockIcon />
              {expired ? "Expired" : `Link expires in ${timeLeft(invoice.expiry)}`}
            </p>
          )}
        </div>

        <div className="border-t border-stone-200 bg-stone-50/70 p-6">
          {paid ? (
            <div className="space-y-4" aria-live="polite">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <CheckMark />
                </span>
                <div className="space-y-1">
                  <h2 className="font-semibold text-stone-900">Payment complete</h2>
                  <p className="text-sm text-stone-600">
                    You paid {fmt(invoice.amount)} MUSD. {merchantName} received {fmt(invoice.amount - invoice.fee)} MUSD.
                    {successUrl ? "" : " You can close this page."}
                  </p>
                </div>
              </div>
              {borrowedToPay && <BorrowerFollowUp snapshot={followUp.data} loading={followUp.isLoading} error={followUp.isError} />}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                {successUrl && (
                  <a href={successUrl} className="inline-flex h-11 items-center rounded-lg bg-stone-900 px-5 text-sm font-medium text-white hover:bg-stone-700">
                    Return to {businessName ?? "the store"}
                  </a>
                )}
                {embedded && (
                  <button type="button" onClick={closeEmbeddedCheckout} className="text-sm font-medium text-stone-700 underline underline-offset-2">
                    Close checkout
                  </button>
                )}
                {status.kind === "sent" && (
                  <a href={txUrl(status.hash)} target="_blank" rel="noreferrer" className="text-sm text-stone-600 underline underline-offset-2">
                    View transaction
                  </a>
                )}
              </div>
            </div>
          ) : expired ? (
            <div className="space-y-1">
              <h2 className="font-semibold text-stone-900">This link has expired</h2>
              <p className="text-sm text-stone-600">Ask {businessName ?? "the merchant"} for a new one. Nothing was charged.</p>
            </div>
          ) : !address ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="font-semibold text-stone-900">Connect a wallet to pay</h2>
                <p className="text-sm text-stone-600">
                  Use a Bitcoin wallet (Xverse, Unisat, OKX) or an EVM wallet. You&apos;ll only see the payment options
                  your wallet can use.
                </p>
              </div>
              <ConnectButton />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="text-xs text-stone-500">MUSD balance</p>
                  <p className="font-medium tabular-nums text-stone-900">{fmt(balance)} MUSD</p>
                </div>
                <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
              </div>

              <div aria-live="polite" className="empty:hidden">
                {status.kind === "working" && (
                  <p className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800">
                    <Spinner />
                    {status.step}…
                  </p>
                )}
                {status.kind === "sent" && !paid && (
                  <p className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800">
                    <Spinner />
                    Waiting for confirmation…
                    <a href={txUrl(status.hash)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      View transaction
                    </a>
                  </p>
                )}
                {status.kind === "error" && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                    {status.message}
                  </p>
                )}
              </div>

              {(hasOption || checking) && <h2 className="pt-1 text-sm font-medium text-stone-900">Choose how to pay</h2>}

              <div className="space-y-2">
                {canPayMusd && (
                  <MethodOption
                    dot="bg-green-600"
                    title="Pay with MUSD"
                    detail={`${fmt(invoice.amount)} MUSD · ${fee.toLowerCase()}`}
                    disabled={busy}
                    onClick={payWithMusd}
                  />
                )}

                {(["BTC", "MEZO"] as const).filter(canSwap).map((method) => (
                  <MethodOption
                    key={method}
                    dot={method === "BTC" ? "bg-[#f7931a]" : "bg-rose-600"}
                    title={`Pay with ${method}`}
                    detail={`≈ ${fmtToken(swapQuotes.data![method]!)} ${method} · ${fee.toLowerCase()}`}
                    note={`Never more than ${fmtToken(withSlippage(swapQuotes.data![method]!))} ${method}. Swapped to MUSD as you pay.`}
                    disabled={busy}
                    onClick={() => payWithSwap(method)}
                  />
                ))}

                {!isSmartAccount && quote.data?.active && (
                  <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
                    <MethodOption
                      dot="bg-orange-600"
                      title="Borrow against my BTC"
                      detail={`Borrow ${fmt(borrowed)} MUSD${fromBalance > 0n ? ` + ${fmt(fromBalance)} from balance` : ""}, no network fee`}
                      note="Keep your Bitcoin. The MUSD is added to your Mezo loan."
                      disabled={!canBorrow || busy}
                      onClick={payWithBorrow}
                      flush
                    />
                    {partialBalance && (
                      <label className="flex items-center gap-2 px-1 text-sm text-stone-700">
                        <input
                          type="checkbox"
                          checked={useBalanceFirst}
                          onChange={(e) => setUseBalanceFirst(e.target.checked)}
                          className="h-4 w-4 rounded border-stone-300 accent-stone-900"
                        />
                        Use my MUSD balance first
                      </label>
                    )}
                    <BorrowDetails quote={quote.data} loading={false} />
                  </div>
                )}
              </div>

              {checking ? (
                <p role="status" className="flex items-center gap-2 text-sm text-stone-500">
                  <Spinner />
                  Checking what this wallet can pay with…
                </p>
              ) : (
                !hasOption && (
                  <div className="space-y-1 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm">
                    <p className="font-medium text-stone-900">This wallet can&apos;t pay {fmt(invoice.amount)} MUSD yet</p>
                    <p className="text-stone-600">
                      You can pay with MUSD, BTC or MEZO, or by borrowing against a Mezo BTC loan.
                      {!supportsSwaps && " This link was made for an earlier version of Mezout, so only MUSD payments work."}
                    </p>
                  </div>
                )
              )}
              {isSmartAccount && (
                <p className="text-xs text-stone-500">Borrow-to-pay needs an EVM wallet for now; Bitcoin-wallet support is coming.</p>
              )}
            </div>
          )}
        </div>
      </section>
      <p className="text-center text-xs text-stone-500">
        Paid straight to {merchantName} through a verified Mezo contract. Mezout never holds your funds.
      </p>
    </div>
  );
}

/** One way to pay: a full-width button with a coloured marker, what it costs, and an optional note. */
function MethodOption({
  dot,
  title,
  detail,
  note,
  disabled,
  onClick,
  flush = false,
}: {
  dot: string;
  title: string;
  detail: string;
  note?: string;
  disabled: boolean;
  onClick: () => void;
  flush?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        flush ? "bg-stone-50 hover:bg-stone-100" : "border border-stone-200 bg-white hover:border-stone-900"
      }`}
    >
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-stone-900">{title}</span>
        <span className="block text-xs text-stone-600">{detail}</span>
        {note && <span className="block text-xs text-stone-500">{note}</span>}
      </span>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 shrink-0 text-stone-400 group-hover:text-stone-900" aria-hidden>
        <path d="M7.5 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-5 w-5" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BorrowDetails({ quote, loading }: { quote?: Awaited<ReturnType<typeof quoteBorrow>>; loading: boolean }) {
  if (loading) return <p className="px-1 text-xs text-stone-500">Checking your loan…</p>;
  if (!quote) return null;
  if (!quote.active) return <p className="px-1 text-xs text-stone-500">No MUSD loan found for this wallet.</p>;
  if (quote.recoveryMode) return <p className="px-1 text-xs text-stone-500">Borrowing is paused while Mezo is in Recovery Mode.</p>;
  return (
    <dl className="grid grid-cols-2 gap-y-1 px-1 text-xs text-stone-600">
      <dt>Collateral ratio</dt>
      <dd className="text-right tabular-nums">
        {pct(quote.icrBefore)} → <span className={quote.canBorrow ? "font-medium text-stone-900" : "font-medium text-red-700"}>{pct(quote.icrAfter)}</span>
      </dd>
      <dt>Borrowing fee (0.1%)</dt>
      <dd className="text-right tabular-nums">{fmt(quote.borrowFee)} MUSD, added to your loan</dd>
      <dt>BTC price</dt>
      <dd className="text-right tabular-nums">${fmt(quote.price)}</dd>
      {!quote.canBorrow && (
        <dd className="col-span-2 pt-1 text-red-700">This would take your loan below the 160% safety floor or its borrowing limit.</dd>
      )}
    </dl>
  );
}

function BorrowerFollowUp({
  snapshot,
  loading,
  error,
}: {
  snapshot?: Awaited<ReturnType<typeof getTroveSnapshot>>;
  loading: boolean;
  error: boolean;
}) {
  if (loading) return <p className="text-sm text-stone-600">Refreshing your loan position…</p>;
  if (error || !snapshot) return <p className="text-sm text-stone-600">Your payment is complete. Refresh this page to check your current loan position.</p>;
  if (!snapshot.active) return <p className="text-sm text-stone-600">Your payment is complete. No active Mezo loan was found for this wallet.</p>;

  const risk = troveRisk(snapshot);
  const tone =
    risk === "critical"
      ? "border-red-300 bg-red-50 text-red-950"
      : risk === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : risk === "watch"
          ? "border-yellow-300 bg-yellow-50 text-yellow-950"
          : "border-green-300 bg-green-50 text-green-950";
  const message =
    risk === "critical"
      ? "Below Mezout's 160% checkout safety floor. Add collateral or repay promptly."
      : risk === "warning"
        ? "Within 20 percentage points of Mezout's 160% checkout safety floor. Consider adding BTC collateral or repaying MUSD."
        : risk === "watch"
          ? "Your position is above the safety floor but worth watching if BTC falls."
          : "Your position has a 200% or greater collateral ratio.";

  return (
    <section className={`rounded-xl border p-4 ${tone}`} aria-live="polite">
      <h3 className="font-medium">Your loan after this payment</h3>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm tabular-nums">
        <dt>Current debt</dt>
        <dd className="text-right">{fmt(snapshot.debt)} MUSD</dd>
        <dt>Collateral ratio</dt>
        <dd className="text-right">{pct(snapshot.icr)}</dd>
        <dt>BTC price</dt>
        <dd className="text-right">${fmt(snapshot.price)}</dd>
      </dl>
      <p className="mt-3 text-sm">{message}</p>
      {snapshot.recoveryMode && <p className="mt-2 text-sm font-medium">Mezo is in Recovery Mode. Borrowing is paused; use Mezo directly to manage your position.</p>}
      <a
        href="https://testnet.mezo.org/borrow"
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-sm font-medium underline"
      >
        Open Mezo to repay MUSD or add BTC collateral
      </a>
      <p className="mt-2 text-xs opacity-80">This check refreshes while this page is open. Mezout never repays debt or moves your BTC automatically.</p>
    </section>
  );
}

function splitSig(sig: Hex, deadline: bigint) {
  const { r, s, v, yParity } = parseSignature(sig);
  return { deadline: deadline.toString(), v: Number(v ?? BigInt(yParity + 27)), r, s };
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "shortMessage" in err) return String((err as { shortMessage: string }).shortMessage);
  return err instanceof Error ? err.message : "Something went wrong";
}
