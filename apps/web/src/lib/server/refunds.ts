import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { erc20Abi, formatUnits, getAddress, isAddressEqual, parseEventLogs, type Hex, type PublicClient } from "viem";
import { mezoTestnetAddresses } from "@mezout/sdk";
import type { Merchant } from "./apiKeys";
import type { Db } from "./db/client";
import { invoices, payments, refunds } from "./db/schema";
import { findInvoiceView, invoiceJson, viewInvoices, type PaymentRow } from "./invoices";
import { newId, recordEvent } from "./webhooks";

export class RefundError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type RefundRow = typeof refunds.$inferSelect;
export type ReceiptReader = Pick<PublicClient, "getTransactionReceipt">;

// Serialises refund changes for one payment, so concurrent requests cannot together refund more than was paid.
const lockPayment = (db: Db, paymentId: string) => db.execute(sql`select id from ${payments} where id = ${paymentId} for update`);

/** MUSD already refunded or promised (pending) for a payment. */
async function committed(db: Db, paymentId: string, statuses: string[]): Promise<bigint> {
  const [row] = await db
    .select({ total: sql<string | null>`sum(${refunds.amount})` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, paymentId), inArray(refunds.status, statuses)));
  return BigInt(row?.total ?? 0);
}

async function invoiceForPayment(db: Db, payment: PaymentRow) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orderId, payment.orderId), sql`lower(${invoices.router}) = lower(${payment.router})`));
  return row ?? null;
}

export function refundJson(r: RefundRow, invoiceId: string | null) {
  return {
    id: r.id,
    object: "refund",
    invoice: invoiceId,
    payment: r.paymentId,
    amount: formatUnits(BigInt(r.amount), 18),
    reason: r.reason,
    status: r.status,
    tx_hash: r.txHash,
    created_at: r.createdAt.toISOString(),
    completed_at: r.completedAt?.toISOString() ?? null,
    canceled_at: r.canceledAt?.toISOString() ?? null,
  };
}

/**
 * Records a refund request for a paid invoice. Mezout holds no funds, so the request stays pending until the
 * merchant sends the MUSD from the dashboard. Pending and completed refunds together cannot exceed the payment.
 */
export async function requestRefund(
  db: Db,
  merchant: Merchant,
  input: { invoiceId: string; amount?: bigint; reason?: string },
): Promise<{ refund: RefundRow; invoiceId: string }> {
  const view = await findInvoiceView(db, merchant, input.invoiceId);
  if (!view) throw new RefundError("No such invoice", 404);
  const payment = view.payment;
  if (!payment) throw new RefundError("This invoice has not been paid");
  const refund = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await lockPayment(t, payment.id);
    const remaining = BigInt(payment.amount) - (await committed(t, payment.id, ["pending", "completed"]));
    const amount = input.amount ?? remaining;
    if (remaining <= 0n) throw new RefundError("This payment is already fully refunded or has refunds pending");
    if (amount <= 0n || amount > remaining) {
      throw new RefundError(`amount must be more than 0 and at most ${formatUnits(remaining, 18)} MUSD`);
    }
    const [row] = await t
      .insert(refunds)
      .values({
        id: newId("re"),
        merchantId: merchant.id,
        paymentId: payment.id,
        amount: amount.toString(),
        reason: input.reason ?? null,
        status: "pending",
      })
      .returning();
    return row;
  });
  return { refund, invoiceId: view.row.id };
}

export async function findRefund(db: Db, merchant: Merchant, id: string) {
  const [row] = await db.select().from(refunds).where(and(eq(refunds.id, id), eq(refunds.merchantId, merchant.id)));
  if (!row) return null;
  const [payment] = await db.select().from(payments).where(eq(payments.id, row.paymentId));
  return { refund: row, invoice: payment ? await invoiceForPayment(db, payment) : null };
}

/**
 * Cancels a pending refund request, which frees its amount for other refunds, and emits refund.canceled so a store
 * that requested it can undo its own record. Sent or canceled refunds cannot be canceled.
 */
export async function cancelRefund(db: Db, merchant: Merchant, id: string, origin: string): Promise<RefundRow> {
  const [row] = await db
    .update(refunds)
    .set({ status: "canceled", canceledAt: new Date() })
    .where(and(eq(refunds.id, id), eq(refunds.merchantId, merchant.id), eq(refunds.status, "pending")))
    .returning();
  if (row) {
    const [payment] = await db.select().from(payments).where(eq(payments.id, row.paymentId));
    const invoice = payment ? await invoiceForPayment(db, payment) : null;
    const view = invoice ? (await viewInvoices(db, [invoice]))[0] : null;
    await recordEvent(db, merchant.id, "refund.canceled", `refund.canceled:${row.id}`, {
      ...refundJson(row, invoice?.id ?? null),
      invoice: view ? invoiceJson(view, merchant, origin) : null,
    });
    return row;
  }
  const found = await findRefund(db, merchant, id);
  if (!found) throw new RefundError("No such refund", 404);
  throw new RefundError(`This refund is ${found.refund.status} and can no longer be canceled`, 409);
}

/**
 * Completes a refund from the transaction that sent it. The receipt must show MUSD moving from the payout address to
 * the customer who paid, mined after the payment. With `refundId`, the transfers must add up to that pending
 * request; without it, a new refund is recorded for their total. Each transaction counts once.
 */
export async function completeRefund(
  db: Db,
  merchant: Merchant,
  client: ReceiptReader,
  input: { paymentId: string; txHash: Hex; refundId?: string },
  origin: string,
): Promise<RefundRow> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, input.paymentId), sql`lower(${payments.merchant}) = lower(${merchant.payoutAddress})`));
  if (!payment) throw new RefundError("No such payment", 404);

  const receipt = await client.getTransactionReceipt({ hash: input.txHash }).catch(() => null);
  if (!receipt) throw new RefundError("That transaction is not confirmed yet. Try again in a few seconds.", 409);
  if (receipt.status !== "success") throw new RefundError("That transaction failed on-chain, so nothing was refunded.");
  if (receipt.blockNumber < BigInt(payment.blockNumber)) throw new RefundError("That transaction came before the payment.");
  const sent = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
    .filter(
      (l) =>
        isAddressEqual(l.address, mezoTestnetAddresses.musd) &&
        isAddressEqual(l.args.from, getAddress(payment.merchant)) &&
        isAddressEqual(l.args.to, getAddress(payment.payer)),
    )
    .reduce((sum, l) => sum + l.args.value, 0n);
  if (sent === 0n) throw new RefundError(`That transaction does not send MUSD from ${payment.merchant} to the customer ${payment.payer}.`);

  const refund = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await lockPayment(t, payment.id);
    const [used] = await t.select({ id: refunds.id }).from(refunds).where(eq(refunds.txHash, input.txHash));
    if (used) throw new RefundError("That transaction is already recorded as a refund.", 409);
    if ((await committed(t, payment.id, ["completed"])) + sent > BigInt(payment.amount)) {
      throw new RefundError("Refunds would exceed what the customer paid.");
    }
    let row: RefundRow | undefined;
    if (input.refundId) {
      [row] = await t
        .update(refunds)
        .set({ status: "completed", txHash: input.txHash, completedAt: new Date() })
        .where(
          and(
            eq(refunds.id, input.refundId),
            eq(refunds.paymentId, payment.id),
            eq(refunds.status, "pending"),
            eq(refunds.amount, sent.toString()),
          ),
        )
        .returning();
      if (!row) throw new RefundError("That transaction does not match the pending refund's amount.");
    } else {
      [row] = await t
        .insert(refunds)
        .values({
          id: newId("re"),
          merchantId: merchant.id,
          paymentId: payment.id,
          amount: sent.toString(),
          status: "completed",
          txHash: input.txHash,
          completedAt: new Date(),
        })
        .returning();
    }
    return row;
  });

  const invoice = await invoiceForPayment(db, payment);
  const view = invoice ? (await viewInvoices(db, [invoice]))[0] : null;
  await recordEvent(db, merchant.id, "refund.completed", `refund.completed:${refund.id}`, {
    ...refundJson(refund, invoice?.id ?? null),
    invoice: view ? invoiceJson(view, merchant, origin) : null,
  });
  return refund;
}
