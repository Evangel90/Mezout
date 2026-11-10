import { isPositiveAmount, sumAmounts } from "./amount";
import { MezoutApiError, type MezoutClient } from "./client";
import type { MezoutStore } from "./store";
import type { ShopifyAdmin } from "./shopify-admin";

/**
 * refunds/create: a refund recorded in Shopify on a Mezout-paid order becomes a refund request in Mezout
 * (POST /v1/refunds). Mezout never holds funds, so the merchant still sends it from the Mezout dashboard; then
 * refund.completed adds a note to the order (see mezout-webhook.ts).
 */

export interface ShopifyRefundPayload {
  id: number | string;
  order_id: number | string;
  note?: string | null;
  transactions?: { amount?: string; kind?: string; status?: string }[];
}

export function refundIdempotencyKey(shop: string, refundId: string | number): string {
  return `shopify-${shop}-refund-${refundId}`;
}

/** The money a Shopify refund returns: its successful refund transactions. Null when it returns none. */
export function refundAmount(refund: ShopifyRefundPayload): string | null {
  const amounts = (refund.transactions ?? [])
    .filter((t) => t.kind === "refund" && (t.status === undefined || t.status === "success"))
    .map((t) => t.amount ?? "0");
  if (!amounts.length) return null;
  const total = sumAmounts(amounts);
  return total && isPositiveAmount(total) ? total : null;
}

export async function handleRefundCreated(opts: {
  shop: string;
  refund: ShopifyRefundPayload;
  store: MezoutStore;
  clientFor: (apiKey: string) => MezoutClient;
  admin: ShopifyAdmin;
}): Promise<string> {
  const { shop, refund, store, admin } = opts;
  const record = await store.getOrder(shop, String(refund.order_id));
  if (!record) return "not mezout";
  if (record.status !== "paid") return "not paid through mezout";
  const amount = refundAmount(refund);
  if (!amount) return "no money refunded";
  const settings = await store.getShop(shop);
  if (!settings?.apiKey) return "not connected";

  let created;
  try {
    created = await opts.clientFor(settings.apiKey).createRefund(
      {
        invoice: record.invoiceId,
        amount,
        ...(refund.note?.trim() ? { reason: refund.note.trim().slice(0, 200) } : {}),
      },
      refundIdempotencyKey(shop, refund.id),
    );
  } catch (e) {
    if (e instanceof MezoutApiError && e.status >= 400 && e.status < 500 && e.status !== 409 && e.status !== 429) {
      await admin.appendNote(
        record.orderGid,
        `Shopify recorded a refund of ${amount}, but Mezout refused the refund request: ${e.message}. Send it from the Mezout dashboard's Payments tab if it is still owed.`,
      );
      return "refused";
    }
    throw e;
  }
  await admin.appendNote(
    record.orderGid,
    `Refund of ${created.amount} MUSD requested in Mezout (${created.id}). The customer has not received it yet: send it from the Payments tab of the Mezout dashboard. This order gets a note when it is sent, or if you decline it there.`,
  );
  return "requested";
}
