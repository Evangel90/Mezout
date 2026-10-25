"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, getAddress, parseUnits, type Address, type Hex } from "viem";
import { api, errorText } from "@/lib/api";
import { txUrl } from "@/lib/config";
import { useMerchant } from "@/lib/merchant";

type Order = {
  invoiceId: string | null;
  orderId: string;
  reference: string | null;
  amount: string;
  status: "pending" | "paid" | "expired" | "refunded";
  refunded: string;
  method: string | null;
  payer: string | null;
  paymentId: string | null;
  txHash: string | null;
  paidAt: string | null;
  createdAt: string;
  pendingRefund: { id: string; amount: string } | null;
};

const STATUS_STYLE: Record<Order["status"], string> = {
  pending: "bg-amber-100 text-amber-900",
  paid: "bg-green-100 text-green-900",
  expired: "bg-stone-200 text-stone-700",
  refunded: "bg-blue-100 text-blue-900",
};
const METHOD_LABEL: Record<string, string> = { MUSD: "MUSD", BORROW: "Borrowed against BTC", MEZO: "MEZO", BTC: "BTC" };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const wei = (v: string) => parseUnits(v, 18);

/**
 * Payments: every stored invoice and every payment to an older link, with refunds. A refund is an MUSD transfer the
 * merchant sends from their own account (sendMusd); Mezout then checks it on-chain and records it. With `limit`, it is
 * the short "recent payments" list on the overview.
 */
export function OrdersPanel({ limit }: { limit?: number }) {
  const { sendMusd } = useMerchant();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrders((await api<{ orders: Order[] }>("/api/dashboard/orders")).orders);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Could not load payments"));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{limit ? "Recent payments" : "Payments"}</h2>
        {limit ? (
          <Link href="/dashboard/payments" className="text-sm text-stone-600 underline hover:text-stone-900">
            View all
          </Link>
        ) : (
          <div className="flex gap-2">
            <button onClick={load} className="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100">
              Refresh
            </button>
            <a href="/api/dashboard/orders?format=csv" className="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100">
              Export CSV
            </a>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {orders === null ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-stone-500">
          {limit ? (
            "No payments yet. Payments to your links and invoices appear here within seconds."
          ) : (
            <>
              No payments yet. Create a payment link on the{" "}
              <Link href="/dashboard" className="underline">
                Overview
              </Link>{" "}
              tab, or an invoice with the API.
            </>
          )}
        </p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {orders.slice(0, limit).map((o) => (
            <OrderRow key={`${o.invoiceId ?? ""}:${o.orderId}`} order={o} sendMusd={sendMusd} onChange={load} />
          ))}
        </ul>
      )}
      {!limit && (
        <p className="text-xs text-stone-500">
          Payments appear here once they are on-chain, usually within seconds. Refunds go from your account back to the
          customer; Mezout never holds the funds.
        </p>
      )}
    </div>
  );
}

function OrderRow({
  order: o,
  sendMusd,
  onChange,
}: {
  order: Order;
  sendMusd: (to: Address, amount: bigint) => Promise<Hex>;
  onChange: () => void;
}) {
  const remaining = wei(o.amount) - wei(o.refunded);
  const canRefund = !!o.paymentId && !!o.payer && remaining > 0n;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(o.pendingRefund?.amount ?? formatUnits(remaining, 18));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refund(e: React.FormEvent) {
    e.preventDefault();
    if (!o.paymentId || !o.payer) return;
    setError(null);
    try {
      const value = wei(o.pendingRefund?.amount ?? amount);
      if (value <= 0n || value > remaining) throw new Error(`Enter up to ${formatUnits(remaining, 18)} MUSD`);
      setBusy("Confirm the transfer in your wallet");
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
      setOpen(false);
      onChange();
    } catch (err) {
      setError(errorText(err, "The refund failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">
            {Number(o.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} MUSD{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[o.status]}`}>{o.status}</span>
            {o.pendingRefund && (
              <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-900">
                refund requested
              </span>
            )}
          </p>
          <p className="truncate text-sm text-stone-600">
            {o.reference ?? (o.invoiceId ? "Payment link" : "Payment link (before order tracking)")}
            {" · "}
            {new Date(o.paidAt ?? o.createdAt).toLocaleString()}
          </p>
          {o.payer && (
            <p className="text-xs text-stone-500">
              {METHOD_LABEL[o.method ?? ""] ?? o.method} from <span className="font-mono">{short(o.payer)}</span>
              {o.txHash && (
                <>
                  {" · "}
                  <a href={txUrl(o.txHash)} target="_blank" rel="noreferrer" className="underline">
                    transaction
                  </a>
                </>
              )}
              {wei(o.refunded) > 0n && ` · ${o.refunded} MUSD refunded`}
            </p>
          )}
        </div>
        {canRefund && !open && (
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
          >
            {o.pendingRefund ? `Send requested refund` : "Refund"}
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={refund} className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-3">
          {o.pendingRefund ? (
            <p className="text-sm">
              Send {o.pendingRefund.amount} MUSD to <span className="font-mono">{short(o.payer!)}</span>
            </p>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              Amount
              <input
                required
                inputMode="decimal"
                pattern="^\d+(\.\d{1,18})?$"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 rounded border border-stone-300 px-2 py-1"
              />
              MUSD to <span className="font-mono">{short(o.payer!)}</span>
            </label>
          )}
          <button
            disabled={!!busy}
            className="rounded bg-stone-900 px-3 py-1 text-sm text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ?? "Send refund"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => setOpen(false)} className="text-sm text-stone-600 underline">
            Cancel
          </button>
          {error && <p className="w-full text-sm text-red-700">{error}</p>}
        </form>
      )}
    </li>
  );
}
