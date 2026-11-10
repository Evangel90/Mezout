import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { handleMezoutWebhook } from "../mezout/mezout-webhook";
import { mezoutStore } from "../mezout/services.server";
import { ShopifyAdmin } from "../mezout/shopify-admin";

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Mezout's webhooks, at <app url>/webhooks/mezout?shop=<shop>.myshopify.com. Authenticated by the Mezout-Signature
 * header against that shop's signing secret, not by Shopify.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const shopParam = new URL(request.url).searchParams.get("shop");
  const shop = shopParam && SHOP_DOMAIN.test(shopParam) ? shopParam : null;
  // The raw body exactly as received: parsing and re-serialising would break the signature.
  const rawBody = await request.text();

  const { status, body } = await handleMezoutWebhook({
    shop,
    rawBody,
    signature: request.headers.get("mezout-signature"),
    store: mezoutStore,
    adminFor: async (s) => new ShopifyAdmin((await unauthenticated.admin(s)).admin.graphql),
  });
  return Response.json(body, { status });
};

export const loader = () => Response.json({ error: "Mezout sends webhooks here with POST" }, { status: 405 });
