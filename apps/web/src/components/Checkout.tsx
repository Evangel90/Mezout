"use client";

import { useMemo, useState } from "react";
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
const noPermit = { deadline: "0", v: 0, r: zeroHash, s: zeroHash };

const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtToken = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumSignificantDigits: 4 });
const withSlippage = (v: bigint) => (v * (10_000n + SLIPPAGE_BPS)) / 10_000n;
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
  return (
    <CheckoutInner token={token} invoice={signed.invoice} invoiceSig={signed.signature} router={linkRouter(signed)} />
  );
}

type SignedInvoice = ReturnType<typeof decodeSignedInvoice>;

function CheckoutInner({
  token,
  invoice,
  invoiceSig,
  router,
}: {
  token: string;
  invoice: SignedInvoice["invoice"];
  invoiceSig: SignedInvoice["signature"];
  router: Address;
}) {
  // Links signed for the first router can only be paid with MUSD or by borrowing.
  const supportsSwaps = isAddressEqual(router, currentRouter);
  const { address } = useAccount();
  const client = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransaction } = useSendTransaction();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [useBalanceFirst, setUseBalanceFirst] = useState(true);

  const { data: code } = useBytecode({ address });
  const isSmartAccount = !!code && code !== "0x";

  const { data: paid, refetch: refetchPaid } = useReadContract({
    address: router,
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
  const canBorrow = !isSmartAccount && !!quote.data?.canBorrow;

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
        message: { amount: borrowed, borrower: address, recipient: router, nonce, deadline },
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

          {canPayMusd && (
            <button
              disabled={busy}
              onClick={payWithMusd}
              className="w-full rounded-lg bg-stone-900 px-4 py-3 text-left text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="block font-medium">Pay with MUSD</span>
              <span className="block text-xs text-stone-300">
                {isSmartAccount ? "Two transactions from your wallet; you pay the network fee" : "Two signatures, no network fee"}
              </span>
            </button>
          )}

          {(["BTC", "MEZO"] as const).filter(canSwap).map((method) => (
            <button
              key={method}
              disabled={busy}
              onClick={() => payWithSwap(method)}
              className="w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-left hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="block font-medium">Pay with {method}</span>
              <span className="block text-xs text-stone-500">
                About {fmtToken(swapQuotes.data![method]!)} {method} (at most {fmtToken(withSlippage(swapQuotes.data![method]!))}),
                swapped on Tigris. {isSmartAccount ? "Two transactions; you pay the network fee" : "Two signatures, no network fee"}
              </span>
            </button>
          ))}

          {!isSmartAccount && quote.data?.active && (
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
              <BorrowDetails quote={quote.data} loading={false} />
            </div>
          )}

          {checking ? (
            <p className="text-sm text-stone-500">Checking what this wallet can pay with…</p>
          ) : (
            !hasOption && (
              <p className="text-sm text-stone-600">
                This wallet has no way to pay {fmt(invoice.amount)} MUSD yet. Pay with MUSD, with BTC or MEZO swapped
                on Tigris, or by borrowing against a Mezo BTC loan.
                {!supportsSwaps && " This link was made before BTC and MEZO payments, so only MUSD and borrowing work."}
              </p>
            )
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

function splitSig(sig: Hex, deadline: bigint) {
  const { r, s, v, yParity } = parseSignature(sig);
  return { deadline: deadline.toString(), v: Number(v ?? BigInt(yParity + 27)), r, s };
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "shortMessage" in err) return String((err as { shortMessage: string }).shortMessage);
  return err instanceof Error ? err.message : "Something went wrong";
}
