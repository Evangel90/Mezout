import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { formatUnits, getAddress, parseUnits, type Hex } from "viem";
import { decodeSignedInvoice, linkRouter, type Invoice } from "@mezout/sdk";
import type { Db } from "./db/client";
import { invoices, payments, refunds } from "./db/schema";
import type { Merchant } from "./apiKeys";
import { randomOrderId, type InvoiceSigner } from "./signInvoice";

export const MIN_EXPIRES_IN = 5 * 60;
export const MAX_EXPIRES_IN = 30 * 24 * 60 * 60;
export const DEFAULT_EXPIRES_IN = 24 * 60 * 60;

export type InvoiceRow = typeof invoices.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type InvoiceStatus = "pending" | "paid" | "expired" | "refunded";
/** An invoice with what the indexer knows about it: its payment, and the MUSD refunded so far. */
export type InvoiceView = { row: InvoiceRow; payment: PaymentRow | null; refunded: bigint };

export async function createInvoice(
  db: Db,
  merchant: Merchant,
  input: { amount: string; reference?: string; expiresIn: number },
  sign: InvoiceSigner,
  now = Date.now(),
): Promise<InvoiceRow> {
  const expiresAt = new Date(Math.floor(now / 1000) * 1000 + input.expiresIn * 1000);
  const invoice: Invoice = {
    merchant: getAddress(merchant.payoutAddress),
    amount: parseUnits(input.amount, 18),
    fee: 0n,
    orderId: randomOrderId(),
    expiry: BigInt(expiresAt.getTime() / 1000),
  };
  const token = await sign(invoice);
  const [row] = await db
    .insert(invoices)
    .values({
      id: "inv_" + randomBytes(12).toString("hex"),
      orderId: invoice.orderId,
      merchantId: merchant.id,
      amount: invoice.amount.toString(),
      fee: invoice.fee.toString(),
      reference: input.reference ?? null,
      token,
      router: getAddress(linkRouter(decodeSignedInvoice(token))),
      expiresAt,
    })
    .returning();
  return row;
}

export async function findInvoice(db: Db, merchant: Merchant, id: string): Promise<InvoiceRow | null> {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.merchantId, merchant.id)));
  return row ?? null;
}

/** Completed refunds per payment id. */
export async function refundedByPayment(db: Db, paymentIds: string[]): Promise<Map<string, bigint>> {
  if (paymentIds.length === 0) return new Map();
  const rows = await db
    .select({ paymentId: refunds.paymentId, total: sql<string>`sum(${refunds.amount})` })
    .from(refunds)
    .where(and(inArray(refunds.paymentId, paymentIds), eq(refunds.status, "completed")))
    .groupBy(refunds.paymentId);
  return new Map(rows.map((r) => [r.paymentId, BigInt(r.total)]));
}

/** Attaches payments and refund totals to invoice rows, in the same order. */
export async function viewInvoices(db: Db, rows: InvoiceRow[]): Promise<InvoiceView[]> {
  if (rows.length === 0) return [];
  const paid = await db
    .select()
    .from(payments)
    .where(inArray(payments.orderId, rows.map((r) => r.orderId)));
  // An invoice is only payable on the router it was signed for.
  const byKey = new Map(paid.map((p) => [`${p.router.toLowerCase()}:${p.orderId}`, p]));
  const refunded = await refundedByPayment(db, paid.map((p) => p.id));
  return rows.map((row) => {
    const payment = byKey.get(`${row.router.toLowerCase()}:${row.orderId}`) ?? null;
    return { row, payment, refunded: payment ? (refunded.get(payment.id) ?? 0n) : 0n };
  });
}

export async function findInvoiceView(db: Db, merchant: Merchant, id: string): Promise<InvoiceView | null> {
  const row = await findInvoice(db, merchant, id);
  return row ? (await viewInvoices(db, [row]))[0] : null;
}

/** A merchant's invoices, newest first. `startingAfter` is the last id of the previous page. */
export async function listInvoices(
  db: Db,
  merchant: Merchant,
  opts: { limit: number; startingAfter?: string },
): Promise<InvoiceView[] | null> {
  let after: InvoiceRow | null = null;
  if (opts.startingAfter) {
    after = await findInvoice(db, merchant, opts.startingAfter);
    if (!after) return null;
  }
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.merchantId, merchant.id),
        after
          ? or(lt(invoices.createdAt, after.createdAt), and(eq(invoices.createdAt, after.createdAt), lt(invoices.id, after.id)))
          : undefined,
      ),
    )
    .orderBy(desc(invoices.createdAt), desc(invoices.id))
    .limit(opts.limit);
  return viewInvoices(db, rows);
}

export function invoiceStatus(view: Omit<InvoiceView, "row"> & { row: Pick<InvoiceRow, "expiresAt"> }, now = Date.now()): InvoiceStatus {
  if (view.payment) return view.refunded >= BigInt(view.payment.amount) ? "refunded" : "paid";
  return view.row.expiresAt.getTime() <= now ? "expired" : "pending";
}

export const METHODS = ["MUSD", "BORROW", "MEZO", "BTC"] as const;

/** Public JSON shape of a payment, as recorded from the router's Paid event. */
export function paymentJson(p: PaymentRow) {
  return {
    id: p.id,
    object: "payment",
    order_id: p.orderId as Hex,
    payer: p.payer,
    method: p.method,
    amount: formatUnits(BigInt(p.amount), 18),
    asset_in: p.assetIn,
    amount_in: formatUnits(BigInt(p.amountIn), 18),
    borrowed: formatUnits(BigInt(p.borrowed), 18),
    router: p.router,
    tx_hash: p.txHash as Hex,
    block_number: p.blockNumber,
    paid_at: p.paidAt.toISOString(),
  };
}

/** Public JSON shape of an invoice. Amounts are decimal MUSD strings. */
export function invoiceJson(view: InvoiceView, merchant: Merchant, origin: string, now = Date.now()) {
  const { row, payment, refunded } = view;
  return {
    id: row.id,
    object: "invoice",
    order_id: row.orderId as Hex,
    merchant: merchant.payoutAddress,
    amount: formatUnits(BigInt(row.amount), 18),
    fee: formatUnits(BigInt(row.fee), 18),
    currency: row.currency,
    reference: row.reference,
    status: invoiceStatus(view, now),
    amount_refunded: formatUnits(refunded, 18),
    payment: payment ? paymentJson(payment) : null,
    checkout_url: new URL(`/pay/${row.token}`, origin).toString(),
    expires_at: row.expiresAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}
