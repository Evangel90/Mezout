import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleRefundCreated, type ShopifyRefundPayload } from "../mezout/refunds";
import { clientFor, mezoutStore } from "../mezout/services.server";
import { ShopifyAdmin } from "../mezout/shopify-admin";

/** refunds/create: a refund recorded in Shopify on a Mezout-paid order becomes a refund request in Mezout. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  if (!admin) return new Response();

  const result = await handleRefundCreated({
    shop,
    refund: payload as ShopifyRefundPayload,
    store: mezoutStore,
    clientFor,
    admin: new ShopifyAdmin(admin.graphql),
  });
  if (result !== "not mezout") console.log(`Mezout: refunds/create ${payload.id} on ${shop}: ${result}`);
  return Response.json({ result });
};
