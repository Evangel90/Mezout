import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { formatUnits } from "viem";
import type { Merchant } from "./apiKeys";
import type { Db } from "./db/client";
import { invoices, payments, refunds } from "./db/schema";
import { invoiceStatus, refundedByPayment, viewInvoices, type InvoiceStatus } from "./invoices";

/** One line of the dashboard's order list: an invoice, or a payment to a link that was never stored. */
export type Order = {
  invoiceId: string | null;
  orderId: string;
  reference: string | null;
  amount: string;
  status: InvoiceStatus;
  refunded: string;
  method: string | null;
  payer: string | null;
  paymentId: string | null;
  txHash: string | null;
  paidAt: string | null;
  createdAt: string;
  pendingRefund: { id: string; amount: string } | null;
};

const musd = (v: bigint | string) => formatUnits(BigInt(v), 18);

export async function listOrders(db: Db, merchant: Merchant, limit = 500): Promise<Order[]> {
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.merchantId, merchant.id))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
  const views = await viewInvoices(db, rows);
  const orphans = await db
    .select({ payment: payments })
    .from(payments)
    .leftJoin(invoices, and(eq(invoices.orderId, payments.orderId), sql`lower(${invoices.router}) = lower(${payments.router})`))
    .where(and(sql`lower(${payments.merchant}) = lower(${merchant.payoutAddress})`, isNull(invoices.id)))
    .orderBy(desc(payments.paidAt))
    .limit(limit);
  const orphanRefunds = await refundedByPayment(db, orphans.map((o) => o.payment.id));

  const paymentIds = [...views.flatMap((v) => (v.payment ? [v.payment.id] : [])), ...orphans.map((o) => o.payment.id)];
  const pending = paymentIds.length
    ? await db.select().from(refunds).where(and(inArray(refunds.paymentId, paymentIds), eq(refunds.status, "pending")))
    : [];
  const pendingFor = (id: string | undefined) => {
    const r = pending.find((p) => p.paymentId === id);
    return r ? { id: r.id, amount: musd(r.amount) } : null;
  };

  const orders: Order[] = [
    ...views.map((v) => ({
      invoiceId: v.row.id,
      orderId: v.row.orderId,
      reference: v.row.reference,
      amount: musd(v.row.amount),
      status: invoiceStatus(v),
      refunded: musd(v.refunded),
      method: v.payment?.method ?? null,
      payer: v.payment?.payer ?? null,
      paymentId: v.payment?.id ?? null,
      txHash: v.payment?.txHash ?? null,
      paidAt: v.payment?.paidAt.toISOString() ?? null,
      createdAt: v.row.createdAt.toISOString(),
      pendingRefund: pendingFor(v.payment?.id),
    })),
    ...orphans.map(({ payment: p }) => {
      const refunded = orphanRefunds.get(p.id) ?? 0n;
      return {
        invoiceId: null,
        orderId: p.orderId,
        reference: null,
        amount: musd(p.amount),
        status: (refunded >= BigInt(p.amount) ? "refunded" : "paid") as InvoiceStatus,
        refunded: musd(refunded),
        method: p.method,
        payer: p.payer,
        paymentId: p.id,
        txHash: p.txHash,
        paidAt: p.paidAt.toISOString(),
        createdAt: p.paidAt.toISOString(),
        pendingRefund: pendingFor(p.id),
      };
    }),
  ];
  return orders.sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt)).slice(0, limit);
}

// Spreadsheet apps run cells that start with these characters as formulas.
const csvCell = (v: string | null) => {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ordersCsv(orders: Order[]): string {
  const header = [
    "created_at",
    "invoice_id",
    "reference",
    "order_id",
    "status",
    "amount_musd",
    "refunded_musd",
    "method",
    "payer",
    "paid_at",
    "tx_hash",
  ];
  const lines = orders.map((o) =>
    [o.createdAt, o.invoiceId, o.reference, o.orderId, o.status, o.amount, o.refunded, o.method, o.payer, o.paidAt, o.txHash]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}
