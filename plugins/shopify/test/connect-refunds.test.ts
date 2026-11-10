import { beforeEach, describe, expect, it } from "vitest";
import { ensureWebhookEndpoint, isConnected, mezoutWebhookUrl, publishAppUrl, saveSettings } from "../app/mezout/connect";
import { paymentLinkState } from "../app/mezout/payment-link";
import { handleRefundCreated, refundIdempotencyKey } from "../app/mezout/refunds";
import { MemoryStore } from "../app/mezout/store";
import { FakeMezout, FakeShopify } from "./fakes";

const shop = "demo.myshopify.com";

describe("connecting a shop", () => {
  let store: MemoryStore;
  let mezout: FakeMezout;

  beforeEach(() => {
    store = new MemoryStore();
    mezout = new FakeMezout();
  });

  const save = (apiKey: string, appUrl = "https://one.trycloudflare.com") =>
    saveSettings({ store, shop, appUrl, clientFor: mezout.client, apiKey, gatewayName: "Pay with Mezout", linkLifetimeHours: 24 });

  it("checks the key, registers the webhook endpoint and keeps its secret", async () => {
    expect(await save("mzk_test_good")).toEqual({ ok: true, registered: true });
    const settings = (await store.getShop(shop))!;
    expect(settings.webhookUrl).toBe(mezoutWebhookUrl("https://one.trycloudflare.com", shop));
    expect(settings.webhookUrl).toBe("https://one.trycloudflare.com/webhooks/mezout?shop=demo.myshopify.com");
    expect(settings.webhookSecret).toMatch(/^whsec_/);
    expect(mezout.endpoints).toHaveLength(1);
    expect(isConnected(settings, "https://one.trycloudflare.com")).toBe(true);
  });

  it("refuses a key Mezout does not accept, and keeps nothing", async () => {
    const res = await save("mzk_test_revoked");
    expect(res.ok).toBe(false);
    expect(res.ok ? "" : res.error).toMatch(/did not accept/);
    expect((await store.getShop(shop))?.apiKey ?? "").toBe("");
    expect(mezout.endpoints).toHaveLength(0);
  });

  it("refuses something that is not a Mezout key without calling the API", async () => {
    expect((await save("sk_live_123")).ok).toBe(false);
    expect(mezout.requests).toHaveLength(0);
  });

  it("does nothing when the endpoint is already current", async () => {
    await save("mzk_test_good");
    const before = mezout.requests.length;
    expect(await ensureWebhookEndpoint({ store, shop, appUrl: "https://one.trycloudflare.com", clientFor: mezout.client })).toBe(false);
    expect(mezout.requests.length).toBe(before);
  });

  it("re-registers when the app URL changes (a new dev tunnel) and deletes the old endpoint", async () => {
    await save("mzk_test_good");
    const old = (await store.getShop(shop))!;
    expect(await ensureWebhookEndpoint({ store, shop, appUrl: "https://two.trycloudflare.com", clientFor: mezout.client })).toBe(true);
    const now = (await store.getShop(shop))!;
    expect(now.webhookUrl).toBe("https://two.trycloudflare.com/webhooks/mezout?shop=demo.myshopify.com");
    expect(now.webhookSecret).not.toBe(old.webhookSecret);
    expect(mezout.endpoints.map((e) => e.url)).toEqual([now.webhookUrl]);
  });

  it("replaces an endpoint with the same URL whose secret the app does not have", async () => {
    mezout.endpoints.push({ id: "we_manual", url: mezoutWebhookUrl("https://one.trycloudflare.com", shop), secret: "whsec_unknown" });
    await save("mzk_test_good");
    expect(mezout.endpoints.map((e) => e.id)).not.toContain("we_manual");
    expect(mezout.endpoints).toHaveLength(1);
  });

  it("keeps the saved key when the field is left empty", async () => {
    await save("mzk_test_good");
    expect((await save("")).ok).toBe(true);
    expect((await store.getShop(shop))!.apiKey).toBe("mzk_test_good");
  });

  it("publishes the app URL to a shop metafield once per URL", async () => {
    const shopify = new FakeShopify();
    expect(await publishAppUrl({ store, shop, appUrl: "https://one.trycloudflare.com", admin: shopify.admin() })).toBe(true);
    expect(shopify.shopMetafields["mezout.app_url"]).toBe("https://one.trycloudflare.com");
    expect(await publishAppUrl({ store, shop, appUrl: "https://one.trycloudflare.com", admin: shopify.admin() })).toBe(false);
  });
});

describe("refunds/create → Mezout refund request", () => {
  let store: MemoryStore;
  let mezout: FakeMezout;
  let shopify: FakeShopify;

  beforeEach(async () => {
    store = new MemoryStore();
    mezout = new FakeMezout();
    shopify = new FakeShopify();
    await store.saveShop(shop, { apiKey: "mzk_test_good" });
    shopify.addOrder(7);
    await store.upsertOrder({
      shop,
      orderId: "7",
      orderGid: "gid://shopify/Order/7",
      orderName: "#1007",
      invoiceId: "inv_7",
      checkoutUrl: "https://usemezout.vercel.app/pay/7",
      amount: "25",
      expiresAt: new Date(Date.now() + 3_600_000),
      status: "paid",
    });
  });

  const refund = { id: 55, order_id: 7, note: "Damaged", transactions: [{ kind: "refund", status: "success", amount: "5.00" }] };

  it("requests the refund in Mezout, once per Shopify refund", async () => {
    const run = () => handleRefundCreated({ shop, refund, store, clientFor: mezout.client, admin: shopify.admin() });
    expect(await run()).toBe("requested");
    await run();
    const posts = mezout.requests.filter((r) => r.path === "/v1/refunds");
    expect(posts[0].body).toEqual({ invoice: "inv_7", amount: "5", reason: "Damaged" });
    expect(posts.every((p) => p.headers["idempotency-key"] === refundIdempotencyKey(shop, 55))).toBe(true);
    expect(mezout.refunds).toHaveLength(1);
    expect(shopify.orders.get("gid://shopify/Order/7")!.note).toContain("requested in Mezout");
  });

  it("ignores refunds on orders not paid through Mezout", async () => {
    await store.updateOrder(shop, "7", { status: "pending" });
    expect(await handleRefundCreated({ shop, refund, store, clientFor: mezout.client, admin: shopify.admin() })).toBe(
      "not paid through mezout",
    );
    expect(await handleRefundCreated({ shop, refund: { ...refund, order_id: 99 }, store, clientFor: mezout.client, admin: shopify.admin() })).toBe(
      "not mezout",
    );
    expect(mezout.requests).toHaveLength(0);
  });
});

describe("payment link for the checkout extension", () => {
  it("returns the link only while the invoice is unpaid and unexpired", async () => {
    const store = new MemoryStore();
    const now = new Date("2026-11-10T12:00:00Z");
    expect(await paymentLinkState(store, shop, "7", now)).toEqual({ status: "none" });
    await store.upsertOrder({
      shop,
      orderId: "7",
      orderGid: "gid://shopify/Order/7",
      orderName: "#1007",
      invoiceId: "inv_7",
      checkoutUrl: "https://usemezout.vercel.app/pay/7",
      amount: "25",
      expiresAt: new Date("2026-11-10T13:00:00Z"),
    });
    expect(await paymentLinkState(store, shop, "7", now)).toMatchObject({ status: "pending", checkout_url: "https://usemezout.vercel.app/pay/7" });
    expect(await paymentLinkState(store, "other.myshopify.com", "7", now)).toEqual({ status: "none" });
    expect(await paymentLinkState(store, shop, "7", new Date("2026-11-10T14:00:00Z"))).toEqual({ status: "expired" });
    await store.updateOrder(shop, "7", { status: "paid" });
    expect(await paymentLinkState(store, shop, "7", now)).toEqual({ status: "paid" });
  });
});
