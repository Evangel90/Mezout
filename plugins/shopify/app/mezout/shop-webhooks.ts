import type { AdminGraphql } from "./shopify-admin";

/**
 * Shop-level Shopify webhook subscriptions for the topics the app cannot work without.
 *
 * The subscriptions declared in shopify.app.toml are app-level. On a `shopify app dev` preview they were observed
 * not to deliver orders/create at all, so the app also subscribes each shop directly through the Admin API and
 * keeps those subscriptions pointed at the current app URL (the tunnel changes on every dev run). If both kinds
 * deliver, the handlers are idempotent per order and per refund, so a second delivery changes nothing.
 */
export const SHOP_WEBHOOKS = [
  { topic: "ORDERS_CREATE", path: "/webhooks/orders/create" },
  { topic: "REFUNDS_CREATE", path: "/webhooks/refunds/create" },
] as const;

type Subscription = { id: string; topic: string; uri: string | null };

async function gql<T>(graphql: AdminGraphql, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await graphql(query, variables ? { variables } : undefined);
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (!body.data) throw new Error(`Shopify webhook subscription call failed: ${JSON.stringify(body.errors ?? body)}`);
  return body.data;
}

function userErrors(result: { userErrors?: { message: string }[] } | null | undefined): void {
  const errors = result?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
}

/**
 * Makes each required topic have exactly one shop-level subscription at `<appUrl><path>`: creates missing ones and
 * deletes ones that point at an old app URL. Returns what changed.
 */
export async function ensureShopWebhooks(
  graphql: AdminGraphql,
  appUrl: string,
): Promise<{ created: string[]; deleted: string[] }> {
  const data = await gql<{ webhookSubscriptions: { nodes: Subscription[] } }>(
    graphql,
    `query MezoutWebhooks($topics: [WebhookSubscriptionTopic!]) {
      webhookSubscriptions(first: 50, topics: $topics) { nodes { id topic uri } }
    }`,
    { topics: SHOP_WEBHOOKS.map((w) => w.topic) },
  );
  const created: string[] = [];
  const deleted: string[] = [];
  for (const { topic, path } of SHOP_WEBHOOKS) {
    const wanted = `${appUrl}${path}`;
    const existing = data.webhookSubscriptions.nodes.filter((s) => s.topic === topic);
    let keep = existing.find((s) => s.uri === wanted);
    for (const sub of existing) {
      if (sub === keep) continue;
      // Only remove subscriptions that are clearly ours (same route), never another integration's.
      if (!sub.uri?.endsWith(path)) continue;
      const res = await gql<{ webhookSubscriptionDelete: { userErrors?: { message: string }[] } }>(
        graphql,
        `mutation MezoutWebhookDelete($id: ID!) { webhookSubscriptionDelete(id: $id) { userErrors { message } } }`,
        { id: sub.id },
      );
      userErrors(res.webhookSubscriptionDelete);
      deleted.push(sub.id);
    }
    if (!keep) {
      const res = await gql<{
        webhookSubscriptionCreate: { webhookSubscription: Subscription | null; userErrors?: { message: string }[] };
      }>(
        graphql,
        `mutation MezoutWebhookCreate($topic: WebhookSubscriptionTopic!, $uri: String!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
            webhookSubscription { id topic uri }
            userErrors { message }
          }
        }`,
        { topic, uri: wanted },
      );
      userErrors(res.webhookSubscriptionCreate);
      keep = res.webhookSubscriptionCreate.webhookSubscription ?? undefined;
      created.push(topic);
    }
  }
  return { created, deleted };
}
