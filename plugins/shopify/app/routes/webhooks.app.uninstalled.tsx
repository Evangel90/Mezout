import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { clientFor, mezoutStore } from "../mezout/services.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Stop Mezout sending this shop's events here, and forget its API key. Order records stay until shop/redact.
  const settings = await mezoutStore.getShop(shop);
  if (settings?.apiKey && settings.webhookEndpointId) {
    try {
      await clientFor(settings.apiKey).deleteWebhookEndpoint(settings.webhookEndpointId);
    } catch (e) {
      console.error(`Mezout: could not delete the webhook endpoint of ${shop}`, e);
    }
  }
  await mezoutStore.deleteShop(shop);

  return new Response();
};
