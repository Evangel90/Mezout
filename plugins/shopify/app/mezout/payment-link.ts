import type { MezoutStore } from "./store";

/**
 * What the "Complete payment" button needs to know about an order. Only an unpaid, unexpired invoice exposes its
 * checkout link. A checkout link only lets someone pay this order's invoice to the merchant, so it is not secret, but
 * it is still only returned for the shop that signed the request.
 */
export type PaymentLinkState =
  | { status: "none" }
  | { status: "pending"; checkout_url: string; amount: string; expires_at: string }
  | { status: "paid" | "expired" | "review" };

/** "gid://shopify/Order/123" or "123" → "123". */
export function orderIdFrom(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(?:gid:\/\/shopify\/(?:Order|OrderIdentity)\/)?(\d+)$/.exec(value.trim());
  return m ? m[1] : null;
}

/** The shop domain from a checkout or customer account session token's `dest` claim. */
export function shopFromDest(dest: string | undefined): string | null {
  if (!dest) return null;
  try {
    return new URL(dest.includes("://") ? dest : `https://${dest}`).hostname;
  } catch {
    return null;
  }
}

export async function paymentLinkState(
  store: MezoutStore,
  shop: string,
  orderId: string,
  now = new Date(),
): Promise<PaymentLinkState> {
  const record = await store.getOrder(shop, orderId);
  if (!record) return { status: "none" };
  if (record.status === "paid") return { status: "paid" };
  if (record.status === "mismatch") return { status: "review" };
  if (record.status === "expired" || record.expiresAt.getTime() <= now.getTime()) return { status: "expired" };
  return {
    status: "pending",
    checkout_url: record.checkoutUrl,
    amount: record.amount,
    expires_at: record.expiresAt.toISOString(),
  };
}
