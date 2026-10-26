import "server-only";
import { and, eq } from "drizzle-orm";
import { getAddress, type Address } from "viem";
import type { Merchant } from "./apiKeys";
import type { Db } from "./db/client";
import { invoices, merchants } from "./db/schema";

export const MAX_BUSINESS_NAME = 64;

export class ProfileError extends Error {}

/**
 * Tidies a business name for display: trims and collapses whitespace. Empty clears it (null). Control characters and
 * bidirectional overrides are refused, since they could make a name read differently from what it is.
 */
export function normalizeBusinessName(raw: string): string | null {
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (/[\p{Cc}‎‏‪-‮⁦-⁩]/u.test(name)) throw new ProfileError("The name has characters that are not allowed");
  if ([...name].length > MAX_BUSINESS_NAME) throw new ProfileError(`Use at most ${MAX_BUSINESS_NAME} characters`);
  return name;
}

export async function setBusinessName(db: Db, merchant: Merchant, raw: string): Promise<string | null> {
  const name = normalizeBusinessName(raw);
  await db.update(merchants).set({ businessName: name }).where(eq(merchants.id, merchant.id));
  return name;
}

/**
 * What the checkout shows about a payment link: the merchant's business name, and the invoice's reference when the
 * link is a stored invoice of that merchant. Both are display-only; the signed invoice decides who gets paid.
 */
export async function checkoutDetails(
  db: Db,
  token: string,
  merchantAddress: Address,
): Promise<{ businessName: string | null; reference: string | null; successUrl: string | null }> {
  const [merchant] = await db.select().from(merchants).where(eq(merchants.payoutAddress, getAddress(merchantAddress)));
  if (!merchant) return { businessName: null, reference: null, successUrl: null };
  const [invoice] = await db
    .select({ reference: invoices.reference, successUrl: invoices.successUrl })
    .from(invoices)
    .where(and(eq(invoices.token, token), eq(invoices.merchantId, merchant.id)));
  return { businessName: merchant.businessName, reference: invoice?.reference ?? null, successUrl: invoice?.successUrl ?? null };
}
