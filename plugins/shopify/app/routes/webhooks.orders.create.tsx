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
  console.log(`Mezout: orders/create request from ${request.headers.get("x-shopify-shop-domain") ?? "unknown shop"}`);
  const { shop, payload, admin } = await authenticate.webhook(request).catch((err: unknown) => {
    console.error("Mezout: orders/create was rejected (signature or session):", err instanceof Response ? err.status : err);
    throw err;
  });
  if (!admin) return new Response(); // The app was uninstalled.

  await syncShop(shop, admin.graphql);
  const result = await handleOrderCreated({
    shop,
    order: payload as ShopifyOrderPayload,
    store: mezoutStore,
    clientFor,
    admin: new ShopifyAdmin(admin.graphql),
  });
  // Logged for every order, including ones paid another way, so a missing invoice can be traced to its cause.
  console.log(
    `Mezout: orders/create ${payload.id} on ${shop} (payment: ${JSON.stringify((payload as ShopifyOrderPayload).payment_gateway_names ?? [])}): ${result}`,
  );
  return Response.json({ result });
};
