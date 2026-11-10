import { amountsEqual, normalizeAmount } from "./amount";
import type { MezoutInvoice, MezoutRefund } from "./client";
import { TAGS } from "./orders";
import { verifyMezoutSignature } from "./signature";
import type { MezoutOrderRecord, MezoutStore } from "./store";
import type { ShopifyAdmin } from "./shopify-admin";

/**
 * Receives Mezout's webhooks at /webhooks/mezout?shop=… and updates Shopify orders. Mirrors Mezout_Webhook in the
 * WooCommerce plugin.
 *
 * Every request is checked against the shop's signing secret before anything else. A signed invoice.paid with an
 * amount matching the order is the only thing that marks an order paid. Events can arrive more than once, so each
 * is handled at most once (by event id) and every handler is safe to repeat. Any answer other than 2xx makes Mezout
 * retry, for up to 24 hours.
 */

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

interface MezoutEvent {
  id: string;
  type: string;
  data?: { object?: Record<string, unknown> };
}

const PAID_FINANCIAL_STATUSES = new Set(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);
const EXPLORER_TX = "https://explorer.test.mezo.org/tx/";

export async function handleMezoutWebhook(opts: {
  shop: string | null;
  rawBody: string;
  signature: string | null;
  store: MezoutStore;
  /** An Admin API client for the shop (from its offline session). */
  adminFor: (shop: string) => Promise<ShopifyAdmin>;
  now?: number;
}): Promise<WebhookResult> {
  const { shop, rawBody, store } = opts;
  if (!shop) return { status: 400, body: { error: "Missing shop" } };

  const settings = await store.getShop(shop);
  if (!settings?.webhookSecret) {
    // Not connected (yet). Answer 503 so Mezout retries once the merchant connects the app.
    return { status: 503, body: { error: "Mezout is not connected on this store" } };
  }
  if (!verifyMezoutSignature(rawBody, opts.signature, settings.webhookSecret, { now: opts.now ?? Date.now() })) {
    return { status: 400, body: { error: "Invalid signature" } };
  }

  let event: MezoutEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid event" } };
  }
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
    return { status: 400, body: { error: "Invalid event" } };
  }
  if (await store.hasSeenEvent(shop, event.id)) {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  const object = (event.data?.object ?? {}) as Record<string, unknown>;
  let result: string;
  try {
    switch (event.type) {
      case "invoice.paid":
        result = await invoicePaid(shop, object as unknown as MezoutInvoice, store, opts.adminFor);
        break;
      case "invoice.expired":
        result = await invoiceExpired(shop, object as unknown as MezoutInvoice, store, opts.adminFor);
        break;
      case "refund.completed":
        result = await refundEvent(shop, object as unknown as MezoutRefund, "completed", store, opts.adminFor);
        break;
      case "refund.canceled":
        result = await refundEvent(shop, object as unknown as MezoutRefund, "canceled", store, opts.adminFor);
        break;
      case "ping":
        result = "pong";
        break;
      default:
        // Mezout may add event types; ignore the ones this version does not know.
        result = "ignored";
    }
  } catch (e) {
    console.error(`Mezout webhook ${event.id} for ${shop} failed`, e);
    return { status: 500, body: { error: "Could not process the event" } };
  }

  await store.markEventSeen(shop, event.id);
  return { status: 200, body: { received: true, result } };
}

/** Marks the order paid, after checking the amount paid matches what was invoiced and what the order still owes. */
async function invoicePaid(
  shop: string,
  invoice: MezoutInvoice,
  store: MezoutStore,
  adminFor: (shop: string) => Promise<ShopifyAdmin>,
): Promise<string> {
  const record = await store.getOrderByInvoice(shop, String(invoice.id ?? ""));
  if (!record) return "not this store";
  if (record.status === "paid") return "already paid";
  const payment = invoice.payment;
  if (!payment || typeof payment !== "object" || !["paid", "refunded"].includes(invoice.status)) return "not paid";
  if (invoice.currency && invoice.currency !== "MUSD") return "not paid";

  const admin = await adminFor(shop);
  const order = await admin.getOrder(record.orderGid);
  if (!order) return "order not found";
  if (order.displayFinancialStatus && PAID_FINANCIAL_STATUSES.has(order.displayFinancialStatus)) {
    await store.updateOrder(shop, record.orderId, { status: "paid", txHash: payment.tx_hash ?? null });
    return "already paid";
  }

  const matchesInvoice = amountsEqual(invoice.amount, record.amount);
  const matchesOrder =
    order.outstandingCurrency === "USD" && amountsEqual(invoice.amount, order.outstandingAmount);
  if (!matchesInvoice || !matchesOrder || order.cancelledAt) {
    await store.updateOrder(shop, record.orderId, { status: "mismatch", txHash: payment.tx_hash ?? null });
    await admin.addTags(record.orderGid, [TAGS.mismatch]);
    const why = order.cancelledAt
      ? "the order was cancelled"
      : `the order now owes ${normalizeAmount(order.outstandingAmount) ?? order.outstandingAmount} ${order.outstandingCurrency}`;
    await admin.appendNote(
      record.orderGid,
      `A Mezout payment of ${invoice.amount} MUSD arrived (${txLink(payment.tx_hash)}), but ${why}, so the order was NOT marked paid. Check the order, then mark it paid or refund the customer from the Mezout dashboard.`,
      order.note,
    );
    return "amount mismatch";
  }

  await admin.markAsPaid(record.orderGid);
  await store.updateOrder(shop, record.orderId, { status: "paid", txHash: payment.tx_hash ?? null });

  // The order is paid; the rest is information for the merchant and must not make Mezout resend the event.
  try {
    await admin.setMetafields(record.orderGid, { status: "paid", tx_hash: String(payment.tx_hash ?? "") });
    await admin.removeTags(record.orderGid, [TAGS.awaiting, TAGS.unpaid]);
    await admin.addTags(record.orderGid, [TAGS.paid]);
    await admin.appendNote(
      record.orderGid,
      `Paid on Mezo: ${invoice.amount} MUSD with ${methodLabel(payment.method)} from ${payment.payer ?? "the customer"}. ${payment.net ?? invoice.amount} MUSD reached the payout address. Transaction: ${txLink(payment.tx_hash)}`,
      order.note,
    );
  } catch (e) {
    console.error(`Mezout: ${record.orderName} on ${shop} marked paid, but updating its details failed`, e);
  }
  return "paid";
}

/** Tags the order when its payment link expires unpaid. The order is not cancelled: the merchant decides. */
async function invoiceExpired(
  shop: string,
  invoice: MezoutInvoice,
  store: MezoutStore,
  adminFor: (shop: string) => Promise<ShopifyAdmin>,
): Promise<string> {
  const record = await store.getOrderByInvoice(shop, String(invoice.id ?? ""));
  if (!record) return "not this store";
  if (record.status !== "pending") return "ignored";
  await store.updateOrder(shop, record.orderId, { status: "expired" });
  const admin = await adminFor(shop);
  await admin.setMetafields(record.orderGid, { status: "expired" });
  await admin.removeTags(record.orderGid, [TAGS.awaiting]);
  await admin.addTags(record.orderGid, [TAGS.unpaid]);
  await admin.appendNote(
    record.orderGid,
    `The Mezout payment link (${record.invoiceId}) expired without being paid. The order was not cancelled; cancel it, or create a new payment link in the Mezout dashboard and send it to the customer.`,
  );
  return "tagged unpaid";
}

/** Notes a refund sent (or declined) in the Mezout dashboard on the order. */
async function refundEvent(
  shop: string,
  refund: MezoutRefund,
  kind: "completed" | "canceled",
  store: MezoutStore,
  adminFor: (shop: string) => Promise<ShopifyAdmin>,
): Promise<string> {
  const invoiceId = typeof refund.invoice === "string" ? refund.invoice : refund.invoice?.id;
  const record: MezoutOrderRecord | null = invoiceId ? await store.getOrderByInvoice(shop, invoiceId) : null;
  if (!record) return "not this store";
  const admin = await adminFor(shop);
  await admin.appendNote(
    record.orderGid,
    kind === "completed"
      ? `Refund ${refund.id} of ${refund.amount} MUSD sent to the customer on Mezo. Transaction: ${txLink(refund.tx_hash ?? undefined)}`
      : `Refund ${refund.id} of ${refund.amount} MUSD was declined or canceled in Mezout, so nothing was sent to the customer. If you recorded a refund in Shopify for it, it was not paid out.`,
  );
  return "noted";
}

function txLink(hash: string | undefined | null): string {
  return hash ? `${EXPLORER_TX}${hash}` : "(no transaction hash)";
}

function methodLabel(method: string | undefined): string {
  return method === "BORROW" ? "MUSD borrowed against BTC" : (method ?? "MUSD");
}
