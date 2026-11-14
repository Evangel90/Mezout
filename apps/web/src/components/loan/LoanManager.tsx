"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useSendTransaction as usePassportSendTransaction } from "@mezo-org/passport";
import { encodeFunctionData, formatUnits, getAddress, isAddress, isAddressEqual, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useBytecode, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";
import {
  LIQUIDATION_ICR,
  MIN_BORROW_ICR,
  borrowerOperationsAbi,
  getAdjustHints,
  getLoanDetails,
  liquidationPrice,
  mezoTestnet,
  mezoTestnetAddresses,
  musdAbi,
  troveRisk,
  type LoanDetails,
  type TroveRisk,
} from "@mezout/sdk";
import { Alert, Badge, Button, CardHeader, ExternalLink, Field, Skeleton, UnitInput, cardClass, inputClass, useConfirm } from "@/components/ui";
import { txUrl } from "@/lib/config";

const MEZO_BORROW_URL = "https://testnet.mezo.org/borrow";
const AMOUNT = /^\d+(\.\d{1,18})?$/;
/** BTC kept back in the wallet for network fees when adding collateral; Mezo testnet fees are far below this. */
const BTC_GAS_RESERVE = 10n ** 14n;
const E18 = 10n ** 18n;

const num = (v: bigint, digits = 2) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: digits });
const musd = (v: bigint) => num(v, 2);
const btc = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 });
const usd = (v: bigint) => `$${Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (v: bigint) => `${Number(formatUnits(v * 100n, 18)).toFixed(0)}%`;
const ratio = (coll: bigint, debt: bigint, price: bigint) => (debt === 0n ? 0n : (coll * price) / debt);
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const RISK: Record<TroveRisk, { tone: "success" | "warning" | "danger" | "neutral"; label: string; advice: string }> = {
  healthy: { tone: "success", label: "Healthy", advice: "Your loan has plenty of room. Check back if BTC falls sharply." },
  watch: { tone: "warning", label: "Worth watching", advice: "Your loan is safe for now, but a large BTC drop would bring it closer to liquidation." },
  warning: {
    tone: "warning",
    label: "Getting close",
    advice: "Your ratio is near Mezout's 160% safety floor. Repaying some MUSD or adding BTC gives you more room.",
  },
  critical: {
    tone: "danger",
    label: "Act soon",
    advice: "Your ratio is below Mezout's 160% safety floor. Below 110% Mezo can liquidate the loan and you lose the BTC behind it. Repay MUSD or add BTC now.",
  },
  unavailable: { tone: "neutral", label: "No open loan", advice: "" },
};

/**
 * A borrower's view of their Mezo loan (trove) after borrowing to pay at checkout: what they owe, how safe it is, and
 * the three things they can do about it: repay, add BTC or close. Every change is a transaction the borrower signs
 * and sends to Mezo's BorrowerOperations themselves; Mezout reads the loan but never acts on it.
 */
export function LoanManager({ initialAddress }: { initialAddress: Address | null }) {
  const { address: connected } = useAccount();
  const [lookup, setLookup] = useState(initialAddress ?? "");
  const [viewing, setViewing] = useState<Address | null>(initialAddress);
  const borrower = viewing ?? connected ?? null;
  const client = usePublicClient({ chainId: mezoTestnet.id });

  const loan = useQuery({
    queryKey: ["loan", borrower],
    queryFn: () => getLoanDetails(client!, borrower!),
    enabled: !!borrower && !!client,
    refetchInterval: 30_000,
  });

  const owns = !!connected && !!borrower && isAddressEqual(connected, borrower);

  function showAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!isAddress(lookup.trim())) return;
    const a = getAddress(lookup.trim());
    setViewing(a);
    window.history.replaceState(null, "", `/loan?address=${a}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-3">
        <p className="eyebrow text-signal-700">For customers</p>
        <h1 className="display-2">Your Mezo loan</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-stone-600">
          Borrowed MUSD against your Bitcoin to pay with Mezout? Check how safe your loan is and pay it back here. Mezout never touches
          your loan: every change is a transaction you sign.
        </p>
      </header>

      <div className={`${cardClass} flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between`}>
        <div className="space-y-1">
          <p className="text-sm font-medium text-stone-900">{borrower ? "Showing the loan for" : "Connect the wallet you paid with"}</p>
          {borrower ? (
            <p className="flex items-center gap-2 text-sm text-stone-600">
              <span className="font-mono">{shortAddr(borrower)}</span>
              {owns ? <Badge tone="success">Your wallet</Badge> : connected ? <Badge>View only</Badge> : null}
            </p>
          ) : (
            <p className="text-sm text-stone-600">Or look up any address to see its loan. Only its owner can make changes.</p>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={showAddress} className="flex gap-2">
            <label htmlFor="loan-address" className="sr-only">
              Wallet address
            </label>
            <input
              id="loan-address"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="0x… address"
              spellCheck={false}
              autoComplete="off"
              className={`${inputClass} font-mono sm:w-56`}
            />
            <Button type="submit" variant="secondary" disabled={!isAddress(lookup.trim())}>
              Look up
            </Button>
          </form>
          {viewing && connected && !isAddressEqual(viewing, connected) && (
            <Button variant="ghost" onClick={() => setViewing(null)}>
              Use my wallet
            </Button>
          )}
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
        </div>
      </div>

      {!borrower ? null : loan.isLoading ? (
        <LoanSkeleton />
      ) : loan.isError || !loan.data ? (
        <Alert tone="danger" title="Couldn't read this loan from Mezo" action={<Button variant="secondary" size="sm" onClick={() => loan.refetch()}>Try again</Button>}>
          Mezo testnet may be busy. Your loan is unaffected.
        </Alert>
      ) : !loan.data.active ? (
        <NoLoan />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <LoanSummary loan={loan.data} updatedAt={loan.dataUpdatedAt} />
          <div className="space-y-6">
            {owns ? (
              <LoanActions borrower={borrower} loan={loan.data} onChanged={() => loan.refetch()} />
            ) : (
              <Alert tone="neutral" title="View only">
                Connect the wallet that owns this loan to repay MUSD, add BTC or close it.
              </Alert>
            )}
            <LoanFacts loan={loan.data} />
          </div>
        </div>
      )}
    </div>
  );
}

function LoanSkeleton() {
  return (
    <div className={`${cardClass} space-y-4 p-6`} aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function NoLoan() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50/60 px-6 py-12 text-center">
      <p className="font-medium text-stone-900">No open Mezo loan for this wallet</p>
      <p className="max-w-md text-sm text-stone-600">
        Either this wallet never borrowed, or its loan is already closed or was liquidated. If you paid by borrowing, check that you
        connected the same wallet.
      </p>
      <ExternalLink href={MEZO_BORROW_URL} className="text-sm font-medium underline underline-offset-2">
        Open Mezo
      </ExternalLink>
    </div>
  );
}

function LoanSummary({ loan, updatedAt }: { loan: LoanDetails; updatedAt: number }) {
  const risk = troveRisk(loan);
  const liquidatable = loan.icr < LIQUIDATION_ICR;
  const r = liquidatable ? { tone: "danger" as const, label: "Can be liquidated", advice: RISK.critical.advice } : RISK[risk];
  const drop = loan.price > loan.liquidationPrice ? Number(((loan.price - loan.liquidationPrice) * 1000n) / loan.price) / 10 : 0;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const ago = Math.max(0, Math.round((now - updatedAt) / 1000));

  return (
    <section className={`${cardClass} space-y-6 p-6`} aria-labelledby="loan-health" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="loan-health" className="text-[15px] font-semibold tracking-tight text-stone-900">
          Loan health
        </h2>
        <Badge tone={r.tone}>{r.label}</Badge>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Stat label="You owe" value={`${musd(loan.debt)} MUSD`} />
        <Stat label="Backed by" value={`${btc(loan.coll)} BTC`} sub={`${usd((loan.coll * loan.price) / E18)} at today's price`} />
        <Stat label="Collateral ratio" value={pct(loan.icr)} sub="Collateral value ÷ debt" />
        <Stat
          label="Liquidation price"
          value={usd(loan.liquidationPrice)}
          sub={drop > 0 ? `BTC is ${usd(loan.price)} now; it can fall ${drop.toFixed(1)}% before this` : `BTC is ${usd(loan.price)} now`}
        />
      </div>

      <RatioBar icr={loan.icr} />

      <p className={`text-sm leading-relaxed ${r.tone === "danger" ? "font-medium text-red-800" : "text-stone-700"}`}>{r.advice}</p>
      {loan.recoveryMode && (
        <Alert tone="warning" title="Mezo is in Recovery Mode">
          The whole system is below 150% collateral. Loans under 150% can be liquidated in this mode, so give yours more room.
          Borrowing at checkout is paused.
        </Alert>
      )}
      <p className="text-xs text-stone-500">Read from Mezo testnet {ago < 15 ? "just now" : `${ago} seconds ago`}; refreshes every 30 seconds.</p>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums text-stone-900">{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

/** The collateral ratio on a 100–250% scale, with Mezo's 110% liquidation line and Mezout's 160% floor marked. */
function RatioBar({ icr }: { icr: bigint }) {
  const MIN = 100;
  const MAX = 250;
  const at = (v: number) => `${((Math.min(Math.max(v, MIN), MAX) - MIN) / (MAX - MIN)) * 100}%`;
  const value = Number(formatUnits(icr * 100n, 18));
  const marks = [
    { v: Number(formatUnits(LIQUIDATION_ICR * 100n, 18)), label: "110% liquidation" },
    { v: Number(formatUnits(MIN_BORROW_ICR * 100n, 18)), label: "160% safety floor" },
  ];
  const fill = value < 110 ? "bg-red-600" : value < 160 ? "bg-red-500" : value < 200 ? "bg-amber-500" : "bg-musd-500";
  return (
    <div className="space-y-2" role="img" aria-label={`Collateral ratio ${value.toFixed(0)}%. Liquidation below 110%.`}>
      <div className="relative h-2.5 rounded-full bg-stone-100">
        <div className="absolute inset-y-0 left-0 rounded-full bg-red-100" style={{ width: at(110) }} />
        <div className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: at(value) }} />
        {marks.map((m) => (
          <span key={m.v} className="absolute -top-1 h-[18px] w-px bg-stone-500" style={{ left: at(m.v) }} />
        ))}
      </div>
      <div className="relative h-4 text-[11px] text-stone-500">
        {marks.map((m) => (
          <span key={m.v} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: at(m.v) }}>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LoanFacts({ loan }: { loan: LoanDetails }) {
  return (
    <section className={`${cardClass} space-y-4 p-6`} aria-labelledby="loan-terms">
      <h2 id="loan-terms" className="text-[15px] font-semibold tracking-tight text-stone-900">
        Loan terms
      </h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
        <dt className="text-stone-600">Borrowed (principal)</dt>
        <dd className="text-right tabular-nums">{musd(loan.principal)} MUSD</dd>
        <dt className="text-stone-600">Interest so far</dt>
        <dd className="text-right tabular-nums">{num(loan.interest, 4)} MUSD</dd>
        <dt className="text-stone-600">Interest rate</dt>
        <dd className="text-right tabular-nums">{(loan.interestRateBps / 100).toLocaleString()}% a year, fixed</dd>
        <dt className="text-stone-600">Minimum debt on an open loan</dt>
        <dd className="text-right tabular-nums">{musd(loan.minNetDebt + loan.gasCompensation)} MUSD</dd>
      </dl>
      <p className="text-xs leading-relaxed text-stone-500">
        Mezo keeps every open loan at {musd(loan.minNetDebt)} MUSD or more, plus a {musd(loan.gasCompensation)} MUSD reserve that pays for
        liquidation and comes back when you close. Repayments pay interest first. For anything else, such as withdrawing BTC or borrowing
        more, use{" "}
        <ExternalLink href={MEZO_BORROW_URL} className="underline underline-offset-2">
          Mezo
        </ExternalLink>
        .
      </p>
    </section>
  );
}

type Action = "repay" | "add" | "close";

function LoanActions({ borrower, loan, onChanged }: { borrower: Address; loan: LoanDetails; onChanged: () => void }) {
  const client = usePublicClient({ chainId: mezoTestnet.id });
  const { chainId } = useAccount();
  const { data: code } = useBytecode({ address: borrower, chainId: mezoTestnet.id });
  const isSmartAccount = !!code && code !== "0x";
  const { sendTransactionAsync } = useSendTransaction();
  const { sendTransaction: passportSend } = usePassportSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const { confirm, dialog } = useConfirm();

  const [tab, setTab] = useState<Action>("repay");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: Hex; text: string } | null>(null);

  const balances = useQuery({
    queryKey: ["loan-balances", borrower],
    queryFn: async () => {
      const [musdBal, btcBal] = await Promise.all([
        client!.readContract({ address: mezoTestnetAddresses.musd, abi: musdAbi, functionName: "balanceOf", args: [borrower] }),
        client!.getBalance({ address: borrower }),
      ]);
      return { musd: musdBal, btc: btcBal };
    },
    enabled: !!client,
    refetchInterval: 30_000,
  });
  const musdBal = balances.data?.musd ?? 0n;
  const btcBal = balances.data?.btc ?? 0n;

  const value = AMOUNT.test(amount) ? parseUnits(amount, 18) : null;
  const maxRepay = musdBal < loan.maxRepay ? musdBal : loan.maxRepay;
  const maxAdd = btcBal > BTC_GAS_RESERVE ? btcBal - BTC_GAS_RESERVE : 0n;
  const max = tab === "repay" ? maxRepay : maxAdd;
  const amountError =
    amount && tab !== "close"
      ? value === null || value === 0n
        ? "Enter an amount such as 10 or 0.001"
        : value > max
          ? tab === "repay"
            ? value > loan.maxRepay
              ? `Mezo lets you repay up to ${musd(loan.maxRepay)} MUSD on an open loan. To pay off everything, close the loan.`
              : "That's more MUSD than this wallet holds"
            : "That's more BTC than this wallet can spare (a little is kept for network fees)"
          : null
      : null;

  // What the loan would look like after this change.
  const preview =
    value && !amountError && tab !== "close"
      ? (() => {
          const debt = tab === "repay" ? loan.debt - value : loan.debt;
          const coll = tab === "add" ? loan.coll + value : loan.coll;
          return { icr: ratio(coll, debt, loan.price), liq: liquidationPrice(coll, debt), debt };
        })()
      : null;

  async function send(data: Hex, txValue: bigint, label: string, success: string) {
    if (!client) throw new Error("Mezo testnet is not reachable");
    setBusy(label);
    setError(null);
    setDone(null);
    try {
      let hash: Hex;
      if (isSmartAccount) {
        const result = await passportSend(mezoTestnetAddresses.borrowerOperations, txValue, data);
        if (!result?.hash) throw new Error("The wallet did not send the transaction");
        hash = result.hash as Hex;
      } else {
        if (chainId !== mezoTestnet.id) await switchChainAsync({ chainId: mezoTestnet.id });
        // Simulate first, so a change Mezo would reject fails here with its reason instead of costing gas.
        const gas = await client.estimateGas({ account: borrower, to: mezoTestnetAddresses.borrowerOperations, data, value: txValue });
        hash = await sendTransactionAsync({
          to: mezoTestnetAddresses.borrowerOperations,
          data,
          value: txValue,
          chainId: mezoTestnet.id,
          gas: (gas * 13n) / 10n,
        });
      }
      setBusy("Waiting for Mezo to confirm…");
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error("Mezo rejected the transaction. Nothing changed; please try again.");
      setDone({ hash, text: success });
      setAmount("");
      onChanged();
      balances.refetch();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function repay() {
    if (!value) return;
    const { upperHint, lowerHint } = await getAdjustHints(client!, borrower, { repay: value });
    const data = encodeFunctionData({ abi: borrowerOperationsAbi, functionName: "repayMUSD", args: [value, upperHint, lowerHint] });
    await send(data, 0n, "Confirm the repayment in your wallet", `Repaid ${musd(value)} MUSD.`);
  }

  async function addBtc() {
    if (!value) return;
    const { upperHint, lowerHint } = await getAdjustHints(client!, borrower, { collIncrease: value });
    const data = encodeFunctionData({ abi: borrowerOperationsAbi, functionName: "addColl", args: [upperHint, lowerHint] });
    await send(data, value, "Confirm adding BTC in your wallet", `Added ${btc(value)} BTC to your loan.`);
  }

  async function close() {
    const ok = await confirm({
      title: "Close your loan?",
      description: `This burns ${musd(loan.closeAmount)} MUSD from your wallet to pay off the loan in full, and sends all ${btc(loan.coll)} BTC back to you.`,
      confirmLabel: "Close loan",
    });
    if (!ok) return;
    const data = encodeFunctionData({ abi: borrowerOperationsAbi, functionName: "closeTrove" });
    await send(data, 0n, "Confirm closing the loan in your wallet", `Loan closed. ${btc(loan.coll)} BTC is back in your wallet.`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || amountError || !value) return;
    (tab === "repay" ? repay() : addBtc()).catch((err) => setError(errorText(err)));
  }

  const canClose = musdBal >= loan.closeAmount && !loan.recoveryMode;
  const tabs: { id: Action; label: string }[] = [
    { id: "repay", label: "Repay MUSD" },
    { id: "add", label: "Add BTC" },
    { id: "close", label: "Close loan" },
  ];

  return (
    <section className={`${cardClass} space-y-5 p-6`} aria-labelledby="loan-actions">
      {dialog}
      <CardHeader id="loan-actions" title="Manage your loan" description="You sign each change in your wallet and pay a small BTC network fee." />

      <div role="tablist" aria-label="Loan actions" className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1 text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setAmount("");
              setError(null);
            }}
            className={`rounded-md px-2 py-2 font-medium transition-colors ${tab === t.id ? "bg-white text-stone-900 shadow-card" : "text-stone-600 hover:text-stone-900"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "close" ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-stone-600">MUSD needed to close</dt>
            <dd className="text-right tabular-nums">{musd(loan.closeAmount)} MUSD</dd>
            <dt className="text-stone-600">In your wallet</dt>
            <dd className="text-right tabular-nums">{balances.data ? `${musd(musdBal)} MUSD` : "…"}</dd>
            <dt className="text-stone-600">BTC you get back</dt>
            <dd className="text-right tabular-nums">{btc(loan.coll)} BTC</dd>
          </dl>
          {loan.recoveryMode ? (
            <p className="text-sm text-stone-600">Mezo doesn&apos;t allow closing loans while it is in Recovery Mode. You can still repay or add BTC.</p>
          ) : !canClose && balances.data ? (
            <p className="text-sm text-stone-600">
              You need {musd(loan.closeAmount - musdBal)} more MUSD to close. Until then you can repay part of the loan or add BTC.
            </p>
          ) : null}
          <Button className="w-full" onClick={() => close().catch((err) => setError(errorText(err)))} disabled={!canClose || !!busy} loading={!!busy}>
            {busy ?? "Close loan and get my BTC back"}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field
            label={tab === "repay" ? "Amount to repay" : "BTC to add"}
            error={amountError}
            hint={
              tab === "repay"
                ? `You can repay up to ${musd(maxRepay)} MUSD now (wallet: ${balances.data ? musd(musdBal) : "…"} MUSD).`
                : `Wallet: ${balances.data ? btc(btcBal) : "…"} BTC. Adding BTC lowers your liquidation price.`
            }
          >
            {(ids) => (
              <div className="flex gap-2">
                <div className="flex-1">
                  <UnitInput
                    {...ids}
                    unit={tab === "repay" ? "MUSD" : "BTC"}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={tab === "repay" ? "10" : "0.001"}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.trim())}
                  />
                </div>
                <Button variant="secondary" onClick={() => setAmount(formatUnits(max, 18))} disabled={max === 0n}>
                  Max
                </Button>
              </div>
            )}
          </Field>
          {tab === "repay" && loan.maxRepay === 0n && (
            <p className="text-sm text-stone-600">
              Your loan is at Mezo&apos;s minimum debt, so it can&apos;t be repaid in part. Close it to pay off everything, or add BTC to make it safer.
            </p>
          )}
          {preview && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg bg-stone-50 px-4 py-3 text-sm">
              <dt className="text-stone-600">Collateral ratio</dt>
              <dd className="text-right tabular-nums">
                {pct(loan.icr)} → <span className="font-medium text-stone-900">{pct(preview.icr)}</span>
              </dd>
              <dt className="text-stone-600">Liquidation price</dt>
              <dd className="text-right tabular-nums">
                {usd(loan.liquidationPrice)} → <span className="font-medium text-stone-900">{usd(preview.liq)}</span>
              </dd>
              {tab === "repay" && (
                <>
                  <dt className="text-stone-600">You&apos;ll owe</dt>
                  <dd className="text-right tabular-nums">{musd(preview.debt)} MUSD</dd>
                </>
              )}
            </dl>
          )}
          <Button type="submit" className="w-full" disabled={!value || !!amountError || !!busy} loading={!!busy}>
            {busy ?? (tab === "repay" ? "Repay" : "Add BTC")}
          </Button>
        </form>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {done && (
        <Alert tone="success" title={done.text}>
          <ExternalLink href={txUrl(done.hash)} className="underline underline-offset-2">
            View the transaction
          </ExternalLink>
        </Alert>
      )}
    </section>
  );
}

function errorText(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string; cause?: { reason?: string } } | null;
  const reason = e?.cause?.reason ?? "";
  if (/minimum/i.test(reason)) return "Mezo keeps an open loan at its minimum debt. Repay a smaller amount, or close the loan.";
  if (/enough mUSD/i.test(reason)) return "This wallet doesn't hold enough MUSD for that.";
  if (/rejected|denied/i.test(e?.shortMessage ?? e?.message ?? "")) return "You cancelled the request in your wallet.";
  return reason || e?.shortMessage || e?.message || "Something went wrong. Your loan is unchanged.";
}
