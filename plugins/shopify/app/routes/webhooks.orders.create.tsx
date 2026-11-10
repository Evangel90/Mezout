import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleOrderCreated, type ShopifyOrderPayload } from "../mezout/orders";
import { clientFor, mezoutStore, syncShop } from "../mezout/services.server";
import { ShopifyAdmin } from "../mezout/shopify-admin";

/**
 * orders/create (HMAC verified by authenticate.webhook): creates the Mezout invoice for orders placed with the
 * Mezout manual payment method. A thrown error answers 500, and Shopify retries; the Idempotency-Key makes the
 * retry return the same invoice.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  if (!admin) return new Response(); // The app was uninstalled.

  await syncShop(shop, admin.graphql);
  const result = await handleOrderCreated({
    shop,
    order: payload as ShopifyOrderPayload,
    store: mezoutStore,
    clientFor,
    admin: new ShopifyAdmin(admin.graphql),
  });
  if (result !== "not mezout") console.log(`Mezout: orders/create ${payload.id} on ${shop}: ${result}`);
  return Response.json({ result });
};
