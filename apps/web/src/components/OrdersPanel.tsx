"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { formatUnits, getAddress, parseUnits, type Address, type Hex } from "viem";
import {
  Alert,
  AmountBreakdown,
  Badge,
  Button,
  Card,
  CardHeader,
  ChevronIcon,
  CopyButton,
  Dialog,
  EmptyState,
  ExternalLink,
  Field,
  ReceiptIcon,
  SearchIcon,
  Skeleton,
  Spinner,
  UnitInput,
  PlusIcon,
  buttonClass,
  formatAmount,
  inputClass,
  relativeTime,
  useConfirm,
} from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { txUrl } from "@/lib/config";
import { useMerchant } from "@/lib/merchant";
import type { Order, OrdersState } from "@/lib/useOrders";

const STATUS: Record<Order["status"], { label: string; tone: "warning" | "success" | "neutral" | "info" }> = {
  pending: { label: "Awaiting payment", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  expired: { label: "Expired", tone: "neutral" },
  refunded: { label: "Refunded", tone: "info" },
};
const METHOD_LABEL: Record<string, string> = { MUSD: "MUSD", BORROW: "Borrowed against BTC", MEZO: "MEZO", BTC: "BTC" };
const FILTERS = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "pending", label: "Awaiting payment" },
  { id: "refund", label: "Refund requested" },
  { id: "refunded", label: "Refunded" },
  { id: "expired", label: "Expired" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const wei = (v: string) => parseUnits(v, 18);
const when = (o: Order) => new Date(o.paidAt ?? o.createdAt);
const describe = (o: Order) => o.reference ?? (o.invoiceId ? "Payment link" : "Payment link (before order tracking)");
const dateFmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const timeFmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function StatusBadges({ order: o }: { order: Order }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
      {o.pendingRefund && <Badge tone="orange">Refund requested</Badge>}
    </span>
  );
}

/**
 * Payments: every stored invoice and every payment to an older link, with refunds. A refund is an MUSD transfer the
 * merchant sends from their own account (sendMusd); Mezout then checks it on-chain and records it. With `limit`, it is
 * the short "recent payments" list on the overview.
 */
export function OrdersPanel({ state, limit }: { state: OrdersState; limit?: number }) {
  const { orders, error, refreshing, reload } = state;

  if (limit) {
    return (
      <Card className="space-y-4 p-6">
        <CardHeader
          title="Recent payments"
          action={
            <Link href="/dashboard/payments" className="inline-flex min-h-[40px] items-center text-sm font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900">
              View all
            </Link>
          }
        />
        {error && <Alert tone="danger">{error}</Alert>}
        {orders === null ? (
          <ListSkeleton rows={4} />
        ) : orders.length === 0 ? (
          <EmptyState icon={<ReceiptIcon />} title="No payments yet">
            Share a payment link. Payments show up here within seconds.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {orders.slice(0, limit).map((o) => (
              <li key={`${o.invoiceId ?? ""}:${o.orderId}`} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-900">{describe(o)}</p>
                  <p className="text-xs text-stone-500">
                    <time dateTime={when(o).toISOString()} title={when(o).toLocaleString()}>
                      {relativeTime(when(o))}
                    </time>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-sm font-medium tabular-nums">{formatAmount(o.amount)} MUSD</p>
                  <StatusBadges order={o} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return <PaymentsList orders={orders} error={error} refreshing={refreshing} reload={reload} />;
}

function PaymentsList({ orders, error, refreshing, reload }: OrdersState) {
  const { sendMusd, method } = useMerchant();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, paid: 0, pending: 0, refund: 0, refunded: 0, expired: 0 };
    for (const o of orders ?? []) {
      c.all++;
      c[o.status]++;
      if (o.pendingRefund) c.refund++;
    }
    return c;
  }, [orders]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (filter === "refund" ? !o.pendingRefund : filter !== "all" && o.status !== filter) return false;
      if (!q) return true;
      return [o.reference, o.invoiceId, o.payer, o.txHash, o.amount].some((v) => v?.toLowerCase().includes(q));
    });
  }, [orders, filter, query]);

  return (
    <Card className="overflow-hidden">
      <div className="space-y-4 border-b border-stone-200 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="group" aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0 || filter === f.id).map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`min-h-[40px] whitespace-nowrap rounded-lg px-3 text-sm sm:min-h-[34px] transition-colors ${
                  filter === f.id ? "bg-stone-200/80 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {f.label}
                <span className={`ml-1.5 tabular-nums ${filter === f.id ? "text-stone-600" : "text-stone-400"}`}>{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <label className="relative block sm:w-64">
            <span className="sr-only">Search payments</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reference, address or ID"
              className={`${inputClass} pl-9`}
            />
          </label>
        </div>
        {error && (
          <Alert
            tone="danger"
            action={
              <Button size="sm" variant="secondary" onClick={reload} loading={refreshing}>
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        )}
      </div>

      {orders === null ? (
        <div className="p-5">
          <ListSkeleton rows={6} />
        </div>
      ) : orders.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={<ReceiptIcon />}
            title="No payments yet"
            action={
              <Link href="/dashboard#new-link" className={buttonClass("primary", "sm")}>
                <PlusIcon className="h-4 w-4" />
                Create a payment link
              </Link>
            }
          >
            Create a link on the Overview and share it. Payments show up here within seconds.
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <div className="space-y-3 p-8 text-center text-sm text-stone-500">
          <p>No payments match{query.trim() ? ` “${query.trim()}”` : " this filter"}.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFilter("all");
              setQuery("");
            }}
          >
            Show all payments
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-[7.5rem_minmax(0,1fr)_8rem_7rem_7rem_9.5rem_1.25rem] gap-4 border-b border-stone-200 bg-stone-50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-stone-500 md:grid">
            <span>Date</span>
            <span>Description</span>
            <span>Method</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Net</span>
            <span>Status</span>
            <span />
          </div>
          <ul className="divide-y divide-stone-100">
            {shown.map((o) => {
              const key = `${o.invoiceId ?? ""}:${o.orderId}`;
              return (
                <OrderRow
                  key={key}
                  order={o}
                  open={open === key}
                  onToggle={() => setOpen(open === key ? null : key)}
                  sendMusd={sendMusd}
                  passkey={method === "passkey"}
                  onChange={reload}
                />
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="w-1/2 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function OrderRow({
  order: o,
  open,
  onToggle,
  sendMusd,
  passkey,
  onChange,
}: {
  order: Order;
  open: boolean;
  onToggle: () => void;
  sendMusd: (to: Address, amount: bigint) => Promise<Hex>;
  passkey: boolean;
  onChange: () => void;
}) {
  const detailsId = useId();
  const remaining = wei(o.amount) - wei(o.refunded);
  const canRefund = !!o.paymentId && !!o.payer && remaining > 0n;
  const [dialog, setDialog] = useState(false);
  const [amount, setAmount] = useState(o.pendingRefund?.amount ?? formatUnits(remaining, 18));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const date = when(o);

  /** Declines a refund requested through the API, without sending anything. */
  async function cancelRequest() {
    if (!o.pendingRefund) return;
    const ok = await confirm({
      title: "Decline this refund request?",
      description: `The ${formatAmount(o.pendingRefund.amount)} MUSD refund request is canceled and nothing is sent. Your store is notified with a refund.canceled webhook.`,
      confirmLabel: "Decline request",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setDone(null);
    setBusy("Canceling the request");
    try {
      await api(`/api/dashboard/refunds/${o.pendingRefund.id}/cancel`, { body: {} });
      setDone("Refund request declined.");
      onChange();
    } catch (err) {
      setError(errorText(err, "Could not cancel the request"));
    } finally {
      setBusy(null);
    }
  }

  /** Checks the amount in the dialog; the refund itself starts once the dialog has closed. */
  function review(e: React.FormEvent) {
    e.preventDefault();
    let value: bigint;
    try {
      value = wei(o.pendingRefund?.amount ?? amount);
    } catch {
      setAmountError("Enter an amount such as 5 or 5.25");
      return;
    }
    if (value <= 0n || value > remaining) {
      setAmountError(`Enter up to ${formatUnits(remaining, 18)} MUSD`);
      return;
    }
    setAmountError(null);
    setDialog(false);
    refund();
  }

  async function refund() {
    if (!o.paymentId || !o.payer) return;
    setError(null);
    setDone(null);
    try {
      const value = wei(o.pendingRefund?.amount ?? amount);
      if (value <= 0n || value > remaining) throw new Error(`Enter up to ${formatUnits(remaining, 18)} MUSD`);
      setBusy(passkey ? "Confirm the transfer with your passkey" : "Confirm the transfer in your wallet");
      const hash = await sendMusd(getAddress(o.payer), value);
      setBusy("Recording the refund");
      // The receipt may take a moment to be readable everywhere; retry briefly.
      for (let i = 0; ; i++) {
        try {
          await api("/api/dashboard/refunds", {
            body: { payment: o.paymentId, tx_hash: hash, refund: o.pendingRefund?.id },
          });
          break;
        } catch (err) {
          if ((err as { status?: number }).status !== 409 || i >= 5) throw err;
          await new Promise((r) => setTimeout(r, 2_000));
        }
      }
      setDone(`Refunded ${formatAmount(formatUnits(value, 18))} MUSD.`);
      onChange();
    } catch (err) {
      setError(errorText(err, "The refund failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={detailsId}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left text-sm transition-colors hover:bg-stone-50 md:grid-cols-[7.5rem_minmax(0,1fr)_8rem_7rem_7rem_9.5rem_1.25rem]"
      >
        <span className="order-3 text-xs text-stone-500 md:order-none md:text-sm md:text-stone-600">
          {dateFmt(date)}
          <span className="block text-xs text-stone-400 max-md:inline max-md:before:content-['_·_']">{timeFmt(date)}</span>
        </span>
        <span className="order-1 truncate font-medium text-stone-900 md:order-none">{describe(o)}</span>
        <span className="hidden truncate text-stone-600 md:block">{o.method ? METHOD_LABEL[o.method] ?? o.method : "—"}</span>
        <span className="order-2 text-right font-medium tabular-nums md:order-none">{formatAmount(o.amount)} MUSD</span>
        <span className="hidden text-right tabular-nums text-stone-600 md:block">{formatAmount(o.net)}</span>
        <span className="order-4 justify-self-end md:order-none md:justify-self-start">
          <StatusBadges order={o} />
        </span>
        <ChevronIcon className={`hidden h-4 w-4 text-stone-400 transition-transform md:block ${open ? "rotate-90" : ""}`} />
      </button>

      {(busy || error || done) && !open && (
        <div className="px-5 pb-3">
          <RowStatus busy={busy} error={error} done={done} />
        </div>
      )}

      {open && (
        <div id={detailsId} className="grid gap-6 border-t border-stone-100 bg-stone-50/60 px-5 py-5 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">Amounts</h3>
            <AmountBreakdown gross={o.amount} fee={o.fee} net={o.net} compact />
            {wei(o.refunded) > 0n && (
              <p className="text-sm text-stone-600">
                Refunded so far: <span className="font-medium tabular-nums text-stone-900">{formatAmount(o.refunded)} MUSD</span>
              </p>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">Details</h3>
            <dl className="space-y-2 text-sm">
              <Detail label="Created">{new Date(o.createdAt).toLocaleString()}</Detail>
              {o.paidAt && <Detail label="Paid">{new Date(o.paidAt).toLocaleString()}</Detail>}
              {o.method && <Detail label="Method">{METHOD_LABEL[o.method] ?? o.method}</Detail>}
              {o.payer && (
                <Detail label="Customer">
                  <span className="font-mono" title={o.payer}>
                    {short(o.payer)}
                  </span>
                </Detail>
              )}
              {o.invoiceId && (
                <Detail label="Invoice">
                  <span className="break-all font-mono text-xs">{o.invoiceId}</span>
                </Detail>
              )}
              {o.txHash && (
                <Detail label="Transaction">
                  <ExternalLink href={txUrl(o.txHash)} className="underline underline-offset-2">
                    {short(o.txHash)}
                  </ExternalLink>
                </Detail>
              )}
            </dl>
          </div>

          {(canRefund || busy || error || done || o.payer) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4 md:col-span-2">
              {canRefund && (
                <Button
                  variant={o.pendingRefund ? "primary" : "secondary"}
                  size="sm"
                  disabled={!!busy}
                  onClick={() => {
                    setAmount(o.pendingRefund?.amount ?? formatUnits(remaining, 18));
                    setAmountError(null);
                    setDialog(true);
                  }}
                >
                  {o.pendingRefund ? "Send requested refund" : "Refund"}
                </Button>
              )}
              {canRefund && o.pendingRefund && (
                <Button variant="danger-outline" size="sm" disabled={!!busy} onClick={cancelRequest}>
                  Decline request
                </Button>
              )}
              {o.payer && <CopyButton text={o.payer} label="Copy customer address" />}
              <div className="w-full">
                <RowStatus busy={busy} error={error} done={done} />
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title={o.pendingRefund ? "Send requested refund" : "Refund payment"}
        description={
          <>
            Sends MUSD from your payout account back to the customer at <span className="font-mono">{o.payer ? short(o.payer) : ""}</span>.
            {passkey ? " Mezout pays the network fee." : " Your wallet pays the network fee."} A sent refund can&apos;t be reversed.
          </>
        }
      >
        <form id={`${detailsId}-refund`} onSubmit={review} className="space-y-4">
          {o.pendingRefund ? (
            <p className="rounded-lg bg-stone-50 px-4 py-3 text-sm">
              Requested amount: <span className="font-semibold tabular-nums">{formatAmount(o.pendingRefund.amount)} MUSD</span>
            </p>
          ) : (
            <Field label="Amount to refund" hint={`Up to ${formatAmount(formatUnits(remaining, 18))} MUSD`} error={amountError}>
              {(ids) => (
                <UnitInput
                  {...ids}
                  unit="MUSD"
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-autofocus
                />
              )}
            </Field>
          )}
          {o.pendingRefund && amountError && <Alert tone="danger">{amountError}</Alert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button type="submit">Continue to {passkey ? "passkey" : "wallet"}</Button>
          </div>
        </form>
      </Dialog>
      {confirmDialog}
    </li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-stone-600">{label}</dt>
      <dd className="min-w-0 text-right text-stone-900">{children}</dd>
    </div>
  );
}

function RowStatus({ busy, error, done }: { busy: string | null; error: string | null; done: string | null }) {
  if (busy)
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-stone-700">
        <Spinner className="h-4 w-4" />
        {busy}…
      </p>
    );
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (done) return <Alert tone="success">{done}</Alert>;
  return null;
}
