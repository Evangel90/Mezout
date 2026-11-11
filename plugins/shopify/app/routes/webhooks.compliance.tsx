import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Shopify's mandatory privacy webhooks (customers/data_request, customers/redact, shop/redact).
 * The app stores no customer data: only order ids and names, invoice ids, amounts and transaction hashes.
 * shop/redact (48 hours after uninstall) deletes everything kept for the shop.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") {
    await db.mezoutOrder.deleteMany({ where: { shop } });
    await db.mezoutEvent.deleteMany({ where: { shop } });
    await db.mezoutShop.deleteMany({ where: { shop } });
  }
  return new Response();
};
