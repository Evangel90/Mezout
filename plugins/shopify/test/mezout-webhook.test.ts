import { beforeEach, describe, expect, it } from "vitest";
import { handleMezoutWebhook } from "../app/mezout/mezout-webhook";
import { TAGS } from "../app/mezout/orders";
import { signMezoutPayload } from "../app/mezout/signature";
import { MemoryStore } from "../app/mezout/store";
import { FakeShopify } from "./fakes";

const shop = "demo.myshopify.com";
const secret = "whsec_demo";
const now = 1_800_000_000_000;

function paidEvent(invoiceId: string, amount: string, eventId = "evt_paid_1") {
  return {
    id: eventId,
    object: "event",
    type: "invoice.paid",
    data: {
      object: {
        id: invoiceId,
        object: "invoice",
        status: "paid",
        amount,
        currency: "MUSD",
        payment: { id: "pay_1", payer: "0xabc", method: "BTC", amount, net: amount, tx_hash: "0xdeadbeef" },
      },
    },
  };
}

describe("Mezout webhooks", () => {
  let store: MemoryStore;
  let shopify: FakeShopify;

  const deliver = (event: unknown, opts: { secret?: string; shop?: string | null; t?: number } = {}) => {
    const raw = JSON.stringify(event);
    return handleMezoutWebhook({
      shop: opts.shop === undefined ? shop : opts.shop,
      rawBody: raw,
      signature: signMezoutPayload(raw, opts.secret ?? secret, opts.t ?? now / 1000),
      store,
      adminFor: async () => shopify.admin(),
      now,
    });
  };

  beforeEach(async () => {
    store = new MemoryStore();
    shopify = new FakeShopify();
    await store.saveShop(shop, { apiKey: "mzk_test_good", webhookSecret: secret });
    shopify.addOrder(7, "25.00");
    await store.upsertOrder({
      shop,
      orderId: "7",
      orderGid: "gid://shopify/Order/7",
      orderName: "#1007",
      invoiceId: "inv_7",
      checkoutUrl: "https://usemezout.vercel.app/pay/7",
      amount: "25",
      expiresAt: new Date(now + 3_600_000),
    });
  });

  it("marks the order paid on a signed invoice.paid with the matching amount", async () => {
    const res = await deliver(paidEvent("inv_7", "25"));
    expect(res).toEqual({ status: 200, body: { received: true, result: "paid" } });
    expect(shopify.count("MezoutMarkAsPaid")).toBe(1);
    const order = shopify.orders.get("gid://shopify/Order/7")!;
    expect(order.displayFinancialStatus).toBe("PAID");
    expect(order.tags.has(TAGS.paid)).toBe(true);
    expect(order.note).toContain("0xdeadbeef");
    expect((await store.getOrder(shop, "7"))!.status).toBe("paid");
  });

  it("ignores a redelivered event", async () => {
    await deliver(paidEvent("inv_7", "25"));
    const res = await deliver(paidEvent("inv_7", "25"));
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(shopify.count("MezoutMarkAsPaid")).toBe(1);
  });

  it("does not mark paid twice for a second paid event (new event id)", async () => {
    await deliver(paidEvent("inv_7", "25", "evt_a"));
    const res = await deliver(paidEvent("inv_7", "25", "evt_b"));
    expect(res.body.result).toBe("already paid");
    expect(shopify.count("MezoutMarkAsPaid")).toBe(1);
  });

  it("rejects a bad signature, a wrong secret or an old timestamp without touching the order", async () => {
    const raw = JSON.stringify(paidEvent("inv_7", "25"));
    const tampered = await handleMezoutWebhook({
      shop,
      rawBody: raw.replace('"25"', '"1"'),
      signature: signMezoutPayload(raw, secret, now / 1000),
      store,
      adminFor: async () => shopify.admin(),
      now,
    });
    expect(tampered.status).toBe(400);
    expect((await deliver(paidEvent("inv_7", "25"), { secret: "whsec_other" })).status).toBe(400);
    expect((await deliver(paidEvent("inv_7", "25"), { t: now / 1000 - 600 })).status).toBe(400);
    const unsigned = await handleMezoutWebhook({ shop, rawBody: raw, signature: null, store, adminFor: async () => shopify.admin(), now });
    expect(unsigned.status).toBe(400);
    expect(shopify.calls).toHaveLength(0);
  });

  it("answers 503 when the shop is not connected, so Mezout retries later", async () => {
    expect((await deliver(paidEvent("inv_7", "25"), { shop: "other.myshopify.com" })).status).toBe(503);
    expect((await deliver(paidEvent("inv_7", "25"), { shop: null })).status).toBe(400);
  });

  it("does not mark paid when the paid amount differs from the invoice", async () => {
    const res = await deliver(paidEvent("inv_7", "2.5"));
    expect(res.body.result).toBe("amount mismatch");
    expect(shopify.count("MezoutMarkAsPaid")).toBe(0);
    expect(shopify.orders.get("gid://shopify/Order/7")!.tags.has(TAGS.mismatch)).toBe(true);
  });

  it("does not mark paid when the order total changed after the invoice was created", async () => {
    shopify.orders.get("gid://shopify/Order/7")!.outstanding = "30.00";
    const res = await deliver(paidEvent("inv_7", "25"));
    expect(res.body.result).toBe("amount mismatch");
    expect(shopify.count("MezoutMarkAsPaid")).toBe(0);
    expect(shopify.orders.get("gid://shopify/Order/7")!.note).toContain("NOT marked paid");
  });

  it("does not mark paid when the invoice is not actually paid", async () => {
    const event = paidEvent("inv_7", "25");
    (event.data.object as Record<string, unknown>).status = "pending";
    expect((await deliver(event)).body.result).toBe("not paid");
    const noPayment = paidEvent("inv_7", "25", "evt_2");
    (noPayment.data.object as Record<string, unknown>).payment = null;
    expect((await deliver(noPayment)).body.result).toBe("not paid");
    expect(shopify.count("MezoutMarkAsPaid")).toBe(0);
  });

  it("ignores invoices from other stores", async () => {
    const res = await deliver(paidEvent("inv_unknown", "25"));
    expect(res.body.result).toBe("not this store");
    expect(shopify.calls).toHaveLength(0);
  });

  it("does not call orderMarkAsPaid when Shopify already shows the order paid", async () => {
    shopify.orders.get("gid://shopify/Order/7")!.displayFinancialStatus = "PAID";
    expect((await deliver(paidEvent("inv_7", "25"))).body.result).toBe("already paid");
    expect(shopify.count("MezoutMarkAsPaid")).toBe(0);
  });

  it("answers 500 when Shopify fails, so Mezout retries, and succeeds on the retry", async () => {
    const original = shopify.graphql;
    shopify.graphql = async () => ({ json: async () => ({ errors: [{ message: "Throttled" }] }) });
    expect((await deliver(paidEvent("inv_7", "25"))).status).toBe(500);
    shopify.graphql = original;
    expect((await deliver(paidEvent("inv_7", "25"))).body.result).toBe("paid");
  });

  it("tags the order unpaid on invoice.expired, without cancelling it", async () => {
    const res = await deliver({ id: "evt_exp", type: "invoice.expired", data: { object: { id: "inv_7", status: "expired", amount: "25" } } });
    expect(res.body.result).toBe("tagged unpaid");
    const order = shopify.orders.get("gid://shopify/Order/7")!;
    expect(order.tags.has(TAGS.unpaid)).toBe(true);
    expect(order.cancelledAt).toBeNull();
    expect((await store.getOrder(shop, "7"))!.status).toBe("expired");
  });

  it("ignores invoice.expired for a paid order", async () => {
    await deliver(paidEvent("inv_7", "25"));
    const res = await deliver({ id: "evt_exp", type: "invoice.expired", data: { object: { id: "inv_7" } } });
    expect(res.body.result).toBe("ignored");
    expect(shopify.orders.get("gid://shopify/Order/7")!.tags.has(TAGS.unpaid)).toBe(false);
  });

  it("adds a note on refund.completed and refund.canceled", async () => {
    const completed = await deliver({
      id: "evt_re",
      type: "refund.completed",
      data: { object: { id: "re_1", amount: "5", tx_hash: "0xfeed", invoice: { id: "inv_7", object: "invoice" } } },
    });
    expect(completed.body.result).toBe("noted");
    expect(shopify.orders.get("gid://shopify/Order/7")!.note).toContain("0xfeed");
    const canceled = await deliver({ id: "evt_rc", type: "refund.canceled", data: { object: { id: "re_2", amount: "5", invoice: "inv_7" } } });
    expect(canceled.body.result).toBe("noted");
    expect(shopify.orders.get("gid://shopify/Order/7")!.note).toContain("re_2");
  });

  it("answers ping and ignores unknown event types", async () => {
    expect((await deliver({ id: "evt_ping", type: "ping", data: { object: { object: "ping" } } })).body.result).toBe("pong");
    expect((await deliver({ id: "evt_new", type: "invoice.something_new", data: {} })).body.result).toBe("ignored");
  });
});
