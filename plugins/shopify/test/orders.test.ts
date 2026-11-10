import { beforeEach, describe, expect, it } from "vitest";
import { handleOrderCreated, invoiceIdempotencyKey, TAGS, type ShopifyOrderPayload } from "../app/mezout/orders";
import { MemoryStore } from "../app/mezout/store";
import { FakeMezout, FakeShopify } from "./fakes";

const shop = "demo.myshopify.com";

function orderPayload(id: number, extra: Partial<ShopifyOrderPayload> = {}): ShopifyOrderPayload {
  return {
    id,
    admin_graphql_api_id: `gid://shopify/Order/${id}`,
    name: `#${1000 + id}`,
    currency: "USD",
    presentment_currency: "USD",
    total_price: "25.00",
    total_outstanding: "25.00",
    financial_status: "pending",
    cancelled_at: null,
    payment_gateway_names: ["Pay with Bitcoin or MUSD (Mezout)"],
    order_status_url: `https://${shop}/123/orders/abc/authenticate?key=xyz`,
    ...extra,
  };
}

describe("orders/create → Mezout invoice", () => {
  let store: MemoryStore;
  let mezout: FakeMezout;
  let shopify: FakeShopify;
  const run = (order: ShopifyOrderPayload) =>
    handleOrderCreated({ shop, order, store, clientFor: mezout.client, admin: shopify.admin() });

  beforeEach(async () => {
    store = new MemoryStore();
    mezout = new FakeMezout();
    shopify = new FakeShopify();
    await store.saveShop(shop, { apiKey: "mzk_test_good", gatewayName: "Pay with Bitcoin or MUSD (Mezout)", linkLifetimeHours: 24 });
  });

  it("creates one invoice for the order total, keyed by the order id, and saves its link", async () => {
    shopify.addOrder(7);
    expect(await run(orderPayload(7))).toBe("invoice created");

    const posts = mezout.requests.filter((r) => r.method === "POST" && r.path === "/v1/invoices");
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["idempotency-key"]).toBe(invoiceIdempotencyKey(shop, 7));
    expect(posts[0].headers["idempotency-key"]).toContain("7");
    expect(posts[0].body).toEqual({
      amount: "25",
      reference: "Order #1007",
      expires_in: 86400,
      success_url: orderPayload(7).order_status_url,
    });

    const record = await store.getOrder(shop, "7");
    expect(record).toMatchObject({ amount: "25", status: "pending", orderGid: "gid://shopify/Order/7" });
    expect(record!.checkoutUrl).toMatch(/^https:\/\/usemezout\.vercel\.app\/pay\//);

    const order = shopify.orders.get("gid://shopify/Order/7")!;
    expect(order.metafields["mezout.checkout_url"]).toBe(record!.checkoutUrl);
    expect(order.metafields["mezout.invoice_id"]).toBe(record!.invoiceId);
    expect(order.tags.has(TAGS.awaiting)).toBe(true);
    expect(order.note).toContain(record!.invoiceId);
  });

  it("does not create a second invoice when Shopify delivers the webhook again", async () => {
    shopify.addOrder(8);
    await run(orderPayload(8));
    expect(await run(orderPayload(8))).toBe("already has invoice");
    expect(mezout.requests.filter((r) => r.path === "/v1/invoices")).toHaveLength(1);
    expect(mezout.invoices.size).toBe(1);
  });

  it("retries a failed request with the same Idempotency-Key, so Mezout runs it once", async () => {
    shopify.addOrder(9);
    mezout.failNext = [500];
    expect(await run(orderPayload(9))).toBe("invoice created");
    const keys = mezout.requests.filter((r) => r.path === "/v1/invoices").map((r) => r.headers["idempotency-key"]);
    expect(keys).toEqual([invoiceIdempotencyKey(shop, 9), invoiceIdempotencyKey(shop, 9)]);
    expect(mezout.invoices.size).toBe(1);
  });

  it("gets the same invoice back if the app lost its record and the webhook is retried (Mezout replays the key)", async () => {
    shopify.addOrder(10);
    await run(orderPayload(10));
    const first = (await store.getOrder(shop, "10"))!.invoiceId;
    store.orders = [];
    await run(orderPayload(10));
    expect((await store.getOrder(shop, "10"))!.invoiceId).toBe(first);
    expect(mezout.invoices.size).toBe(1);
  });

  it("throws on a Mezout outage so Shopify retries the webhook", async () => {
    shopify.addOrder(11);
    mezout.failNext = [503, 503];
    await expect(run(orderPayload(11))).rejects.toThrow();
    expect(await store.getOrder(shop, "11")).toBeNull();
  });

  it("ignores orders paid another way", async () => {
    shopify.addOrder(12);
    expect(await run(orderPayload(12, { payment_gateway_names: ["bogus"] }))).toBe("not mezout");
    expect(mezout.requests).toHaveLength(0);
    expect(shopify.calls).toHaveLength(0);
  });

  it("refuses non-USD orders clearly instead of charging the wrong amount", async () => {
    shopify.addOrder(13);
    expect(await run(orderPayload(13, { currency: "EUR", presentment_currency: "EUR" }))).toBe("unsupported currency");
    expect(await run(orderPayload(14, { currency: "USD", presentment_currency: "CAD" }))).toBe("unsupported currency");
    expect(mezout.requests).toHaveLength(0);
    expect(shopify.orders.get("gid://shopify/Order/13")!.tags.has(TAGS.unsupportedCurrency)).toBe(true);
    expect(shopify.orders.get("gid://shopify/Order/13")!.note).toContain("EUR");
  });

  it("flags the order when the app has no API key", async () => {
    await store.saveShop(shop, { apiKey: "" });
    shopify.addOrder(15);
    expect(await run(orderPayload(15))).toBe("not connected");
    expect(shopify.orders.get("gid://shopify/Order/15")!.tags.has(TAGS.error)).toBe(true);
  });

  it("skips orders that are already paid, cancelled or free", async () => {
    expect(await run(orderPayload(16, { financial_status: "paid" }))).toBe("already paid");
    expect(await run(orderPayload(17, { cancelled_at: "2026-11-10T00:00:00Z" }))).toBe("cancelled");
    expect(await run(orderPayload(18, { total_price: "0.00", total_outstanding: "0.00" }))).toBe("nothing to pay");
    expect(mezout.requests).toHaveLength(0);
  });

  it("uses the configured link lifetime and leaves out a non-https success URL", async () => {
    await store.saveShop(shop, { linkLifetimeHours: 2 });
    shopify.addOrder(19);
    await run(orderPayload(19, { order_status_url: "http://example.com/status" }));
    const body = mezout.requests.find((r) => r.path === "/v1/invoices")!.body as Record<string, unknown>;
    expect(body.expires_in).toBe(7200);
    expect(body).not.toHaveProperty("success_url");
  });
});
