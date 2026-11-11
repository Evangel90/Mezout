import prisma from "../db.server";
import { MezoutClient, mezoutApiBase } from "./client";
import { ensureWebhookEndpoint, publishAppUrl } from "./connect";
import { ensureShopWebhooks } from "./shop-webhooks";
import { ShopifyAdmin, type AdminGraphql } from "./shopify-admin";
import { PrismaMezoutStore } from "./store.server";

/** The app's wiring: the database, the Mezout API client and the app URL. */

export const mezoutStore = new PrismaMezoutStore(prisma);

/** A Mezout client for a shop's API key. The API base is MEZOUT_API_BASE, or production Mezout. */
export function clientFor(apiKey: string): MezoutClient {
  return new MezoutClient({ apiKey, baseUrl: mezoutApiBase() });
}

/** The app's public URL. `shopify app dev` sets it to the current tunnel on every run. */
export function appUrl(): string {
  return (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "");
}

/**
 * Brings a shop up to date with the current app URL: re-registers its Mezout webhook endpoint and republishes the
 * URL the checkout extension calls, if either changed. Cheap when nothing changed (database reads only).
 * Never throws: problems are logged and shown on the settings page.
 */
export async function syncShop(shop: string, graphql: AdminGraphql): Promise<void> {
  const url = appUrl();
  if (!url) return;
  try {
    await ensureWebhookEndpoint({ store: mezoutStore, shop, appUrl: url, clientFor });
  } catch (e) {
    console.error(`Mezout: could not register the webhook endpoint for ${shop}`, e);
  }
  try {
    await publishAppUrl({ store: mezoutStore, shop, appUrl: url, admin: new ShopifyAdmin(graphql) });
  } catch (e) {
    console.error(`Mezout: could not publish the app URL to ${shop}`, e);
  }
  // Once per process, shop and app URL: one Admin API read, plus writes only when the tunnel URL changed.
  const key = `${shop}|${url}`;
  if (!shopWebhooksSynced.has(key)) {
    try {
      const { created, deleted } = await ensureShopWebhooks(graphql, url);
      shopWebhooksSynced.add(key);
      if (created.length || deleted.length) {
        console.log(`Mezout: Shopify webhooks for ${shop}: created ${created.join(", ") || "none"}, removed ${deleted.length} old`);
      }
    } catch (e) {
      console.error(`Mezout: could not subscribe ${shop} to order and refund webhooks`, e);
    }
  }
}

const shopWebhooksSynced = new Set<string>();

declare global {
  // eslint-disable-next-line no-var
  var mezoutSyncedAppUrl: string | undefined;
}

/**
 * Once per process and app URL: syncs every connected shop, so webhooks follow a new tunnel URL as soon as the app
 * starts, without waiting for the merchant to open the app.
 */
export function syncAllShopsOnce(adminGraphqlFor: (shop: string) => Promise<AdminGraphql>): void {
  const url = appUrl();
  if (!url || global.mezoutSyncedAppUrl === url) return;
  global.mezoutSyncedAppUrl = url;
  setTimeout(async () => {
    try {
      for (const { shop } of await mezoutStore.listConnectedShops()) {
        try {
          await syncShop(shop, await adminGraphqlFor(shop));
        } catch (e) {
          // No offline session (app uninstalled): nothing to sync.
          console.error(`Mezout: skipped syncing ${shop}`, e);
        }
      }
    } catch (e) {
      console.error("Mezout: startup sync failed", e);
    }
  }, 2000);
}
