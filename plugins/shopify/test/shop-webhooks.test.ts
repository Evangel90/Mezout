import { describe, expect, it } from "vitest";
import { ensureShopWebhooks } from "../app/mezout/shop-webhooks";
import type { AdminGraphql } from "../app/mezout/shopify-admin";

type Sub = { id: string; topic: string; uri: string | null };

/** A fake Admin API holding webhook subscriptions. */
function fakeShopify(initial: Sub[]) {
  const subs = [...initial];
  let next = 100;
  const graphql: AdminGraphql = async (query, options) => {
    const v = options?.variables ?? {};
    let data: unknown;
    if (query.includes("webhookSubscriptions(")) {
      const topics = v.topics as string[];
      data = { webhookSubscriptions: { nodes: subs.filter((s) => topics.includes(s.topic)) } };
    } else if (query.includes("webhookSubscriptionDelete")) {
      subs.splice(subs.findIndex((s) => s.id === v.id), 1);
      data = { webhookSubscriptionDelete: { userErrors: [] } };
    } else if (query.includes("webhookSubscriptionCreate")) {
      const sub = { id: `gid://${next++}`, topic: v.topic as string, uri: v.uri as string };
      subs.push(sub);
      data = { webhookSubscriptionCreate: { webhookSubscription: sub, userErrors: [] } };
    }
    return { json: async () => ({ data }) };
  };
  return { graphql, subs };
}

describe("shop-level Shopify webhooks", () => {
  const url = "https://new-tunnel.trycloudflare.com";

  it("creates both subscriptions when none exist", async () => {
    const shop = fakeShopify([]);
    const result = await ensureShopWebhooks(shop.graphql, url);
    expect(result.created).toEqual(["ORDERS_CREATE", "REFUNDS_CREATE"]);
    expect(shop.subs.map((s) => s.uri)).toEqual([`${url}/webhooks/orders/create`, `${url}/webhooks/refunds/create`]);
  });

  it("does nothing when they already point at the app", async () => {
    const shop = fakeShopify([
      { id: "a", topic: "ORDERS_CREATE", uri: `${url}/webhooks/orders/create` },
      { id: "b", topic: "REFUNDS_CREATE", uri: `${url}/webhooks/refunds/create` },
    ]);
    expect(await ensureShopWebhooks(shop.graphql, url)).toEqual({ created: [], deleted: [] });
    expect(shop.subs).toHaveLength(2);
  });

  it("moves subscriptions off an old tunnel and leaves other integrations alone", async () => {
    const old = "https://old-tunnel.trycloudflare.com";
    const shop = fakeShopify([
      { id: "a", topic: "ORDERS_CREATE", uri: `${old}/webhooks/orders/create` },
      { id: "x", topic: "ORDERS_CREATE", uri: "https://other-app.example/hooks/orders" },
    ]);
    const result = await ensureShopWebhooks(shop.graphql, url);
    expect(result.deleted).toEqual(["a"]);
    expect(result.created).toEqual(["ORDERS_CREATE", "REFUNDS_CREATE"]);
    expect(shop.subs.map((s) => s.uri).sort()).toEqual(
      [`${url}/webhooks/orders/create`, `${url}/webhooks/refunds/create`, "https://other-app.example/hooks/orders"].sort(),
    );
  });
});
