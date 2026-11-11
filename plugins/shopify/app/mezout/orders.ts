import { isPositiveAmount, normalizeAmount } from "./amount";
import { MezoutApiError, type MezoutClient } from "./client";
import { DEFAULT_GATEWAY_NAME, isMezoutGateway, isSupportedCurrency } from "./gateway";
import type { MezoutStore } from "./store";
import type { ShopifyAdmin } from "./shopify-admin";

/**
 * orders/create: when the customer chose the Mezout manual payment method, create a Mezout invoice for the order
 * total and keep its checkout link on the order. The order stays "Payment pending" until a signed invoice.paid
 * webhook arrives (see mezout-webhook.ts).
 */

/** The fields of Shopify's orders/create payload this app reads. */
export interface ShopifyOrderPayload {
  id: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  currency?: string;
  presentment_currency?: string;
  total_price?: string;
  total_outstanding?: string;
  financial_status?: string;
  cancelled_at?: string | null;
  payment_gateway_names?: string[];
  order_status_url?: string;
}

export const TAGS = {
  awaiting: "mezout-awaiting-payment",
  paid: "mezout-paid",
  unpaid: "mezout-unpaid",
  mismatch: "mezout-amount-mismatch",
  unsupportedCurrency: "mezout-unsupported-currency",
  error: "mezout-error",
} as const;

/** Unique per shop and order, so a retried webhook (or a second delivery) never creates a second invoice. */
export function invoiceIdempotencyKey(shop: string, orderId: string | number): string {
  return `shopify-${shop}-order-${orderId}`;
}

/** Mezout only sends customers back to https pages (http only for localhost). */
export function isReturnUrlAllowed(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname));
  } catch {
    return false;
  }
}

export type OrderCreatedResult =
  | "not mezout"
  | "already has invoice"
  | "already paid"
  | "cancelled"
  | "not connected"
  | "unsupported currency"
  | "nothing to pay"
  | "invoice created";

export async function handleOrderCreated(opts: {
  shop: string;
  order: ShopifyOrderPayload;
  store: MezoutStore;
  clientFor: (apiKey: string) => MezoutClient;
  admin: ShopifyAdmin;
}): Promise<OrderCreatedResult> {
  const { shop, order, store, admin } = opts;
  const settings = await store.getShop(shop);
  if (!isMezoutGateway(order.payment_gateway_names, settings?.gatewayName || DEFAULT_GATEWAY_NAME)) {
    return "not mezout";
  }

  const orderId = String(order.id);
  const orderGid = order.admin_graphql_api_id ?? `gid://shopify/Order/${orderId}`;
  const orderName = order.name ?? `#${orderId}`;

  const existing = await store.getOrder(shop, orderId);
  if (existing) return "already has invoice";
  if (order.financial_status === "paid") return "already paid";
  if (order.cancelled_at) return "cancelled";

  if (!settings?.apiKey) {
    await admin.addTags(orderGid, [TAGS.error]);
    await admin.appendNote(
      orderGid,
      "The customer chose Mezout, but the Mezout app has no API key, so no payment link was created. Open the Mezout app, connect it, and send the customer a payment link from the Mezout dashboard.",
    );
    return "not connected";
  }

  // Customers pay in MUSD, one MUSD per US dollar. Shopify has no MUSD currency, so only USD orders can be charged.
  if (!isSupportedCurrency(order.currency) || !isSupportedCurrency(order.presentment_currency ?? order.currency)) {
    await admin.addTags(orderGid, [TAGS.unsupportedCurrency]);
    await admin.appendNote(
      orderGid,
      `No Mezout payment link was created: the order is in ${order.presentment_currency ?? order.currency}, and Mezout charges MUSD at 1:1 with US dollars only. Set the store currency to USD (and disable other presentment currencies for this payment method), or collect this payment another way.`,
    );
    return "unsupported currency";
  }

  const amount = normalizeAmount(order.total_outstanding ?? order.total_price);
  if (!amount || !isPositiveAmount(amount)) return "nothing to pay";

  const lifetimeHours = settings.linkLifetimeHours || 24;
  const client = opts.clientFor(settings.apiKey);
  let invoice;
  try {
    invoice = await client.createInvoice(
      {
        amount,
        reference: `Order ${orderName}`.slice(0, 200),
        expires_in: Math.min(2_592_000, Math.max(300, lifetimeHours * 3600)),
        ...(isReturnUrlAllowed(order.order_status_url) ? { success_url: order.order_status_url } : {}),
      },
      invoiceIdempotencyKey(shop, orderId),
    );
  } catch (e) {
    // 4xx will fail the same way again, so tell the merchant instead of letting Shopify retry for hours.
    if (e instanceof MezoutApiError && e.status >= 400 && e.status < 500 && e.status !== 409 && e.status !== 429) {
      await admin.addTags(orderGid, [TAGS.error]);
      await admin.appendNote(orderGid, `Mezout could not create a payment link for this order: ${e.message}`);
      return "not connected";
    }
    throw e;
  }

  await store.upsertOrder({
    shop,
    orderId,
    orderGid,
    orderName,
    invoiceId: invoice.id,
    checkoutUrl: invoice.checkout_url,
    amount: normalizeAmount(invoice.amount) ?? amount,
    expiresAt: new Date(invoice.expires_at),
  });

  // The payment link is saved, so the customer can pay. What follows only informs the merchant: a failure there is
  // logged rather than retried, since a retry would stop at "already has invoice" anyway.
  try {
    // Visible on the order, and usable in notification templates as order.metafields.mezout.checkout_url.
    await admin.setMetafields(orderGid, {
      invoice_id: invoice.id,
      checkout_url: invoice.checkout_url,
      status: "pending",
    });
    await admin.addTags(orderGid, [TAGS.awaiting]);
    await admin.appendNote(
      orderGid,
      `Invoice ${invoice.id} created for ${invoice.amount} MUSD, payable until ${invoice.expires_at}. The customer pays at ${invoice.checkout_url} (the "Complete payment" button on their order page). The order is marked paid when Mezout confirms the payment on Mezo.`,
    );
  } catch (e) {
    console.error(`Mezout: invoice ${invoice.id} created for ${shop} order ${orderId}, but updating the order failed`, e);
  }
  return "invoice created";
}
