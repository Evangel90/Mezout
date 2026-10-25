import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { formatUnits, getAddress, parseUnits, type Hex } from "viem";
import { decodeSignedInvoice, linkRouter, type Invoice } from "@mezout/sdk";
import type { Db } from "./db/client";
import { invoices } from "./db/schema";
import type { Merchant } from "./apiKeys";
import { randomOrderId, type InvoiceSigner } from "./signInvoice";

export const MIN_EXPIRES_IN = 5 * 60;
export const MAX_EXPIRES_IN = 30 * 24 * 60 * 60;
export const DEFAULT_EXPIRES_IN = 24 * 60 * 60;

type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceStatus = "pending" | "paid" | "expired";

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
      router: linkRouter(decodeSignedInvoice(token)),
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

export function invoiceStatus(row: InvoiceRow, paidOnChain: boolean, now = Date.now()): InvoiceStatus {
  if (paidOnChain) return "paid";
  return row.expiresAt.getTime() <= now ? "expired" : "pending";
}

/** Public JSON shape of an invoice. Amounts are decimal MUSD strings. */
export function invoiceJson(row: InvoiceRow, merchant: Merchant, status: InvoiceStatus, origin: string) {
  return {
    id: row.id,
    object: "invoice",
    order_id: row.orderId as Hex,
    merchant: merchant.payoutAddress,
    amount: formatUnits(BigInt(row.amount), 18),
    fee: formatUnits(BigInt(row.fee), 18),
    currency: row.currency,
    reference: row.reference,
    status,
    checkout_url: new URL(`/pay/${row.token}`, origin).toString(),
    expires_at: row.expiresAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}
