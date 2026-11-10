import { createHash } from "node:crypto";
import { MezoutApiError, MezoutClient } from "./client";
import type { MezoutStore, ShopSettings } from "./store";
import type { ShopifyAdmin } from "./shopify-admin";

/**
 * Connecting a shop to Mezout: checking its API key, and registering the app's webhook URL with Mezout so payment
 * events reach it. Mirrors WC_Gateway_Mezout::connect() in the WooCommerce plugin.
 *
 * `shopify app dev` gives the app a new tunnel URL on every run, so the endpoint is checked again whenever the app
 * starts, opens or receives an order, and re-registered when the URL has changed.
 */

export type ClientFactory = (apiKey: string) => MezoutClient;

export function hashKey(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex");
}

/** The URL Mezout delivers this shop's events to. The shop is in the query so the app knows which secret to use. */
export function mezoutWebhookUrl(appUrl: string, shop: string): string {
  // Normalised the way Mezout stores endpoint URLs (WHATWG URL serialisation), so stored and listed URLs compare equal.
  return new URL(`${appUrl.replace(/\/+$/, "")}/webhooks/mezout?shop=${encodeURIComponent(shop)}`).toString();
}

export function isConnected(settings: ShopSettings | null, appUrl: string): boolean {
  return Boolean(
    appUrl &&
      settings?.apiKey &&
      settings.webhookSecret &&
      settings.webhookUrl === mezoutWebhookUrl(appUrl, settings.shop) &&
      settings.webhookKeyHash === hashKey(settings.apiKey),
  );
}

/**
 * Makes sure Mezout sends this shop's events to the current app URL, registering a new endpoint if the URL or the
 * key changed. Returns true when it registered a new endpoint. Does nothing (and makes no request) when the
 * stored endpoint is current.
 *
 * @throws MezoutApiError when Mezout refuses the key or the endpoint.
 */
export async function ensureWebhookEndpoint(opts: {
  store: MezoutStore;
  shop: string;
  appUrl: string;
  clientFor: ClientFactory;
  force?: boolean;
}): Promise<boolean> {
  const { store, shop, appUrl, clientFor } = opts;
  const settings = await store.getShop(shop);
  if (!settings?.apiKey) return false;
  if (!appUrl) throw new MezoutApiError("the app URL is not set (SHOPIFY_APP_URL), so webhooks cannot be registered", 0);
  if (!opts.force && isConnected(settings, appUrl)) return false;

  const url = mezoutWebhookUrl(appUrl, shop);
  const keyHash = hashKey(settings.apiKey);
  const client = clientFor(settings.apiKey);

  // Remove the endpoint this app registered before (an old tunnel URL), if it belongs to the same Mezout account.
  if (settings.webhookEndpointId && settings.webhookKeyHash === keyHash) {
    await deleteQuietly(client, settings.webhookEndpointId);
  }
  // Replace any endpoint already pointing at this URL: its secret is not stored, so its events cannot be verified.
  for (const endpoint of await client.listWebhookEndpoints()) {
    if (endpoint.url === url && endpoint.id !== settings.webhookEndpointId) await deleteQuietly(client, endpoint.id);
  }

  let endpoint;
  try {
    endpoint = await client.createWebhookEndpoint(url);
  } catch (e) {
    if (e instanceof MezoutApiError) {
      throw new MezoutApiError(
        `could not set up webhooks for ${url}: ${e.message}. Mezout delivers only to public https addresses, and an account can have at most 3 endpoints (delete unused ones on the dashboard's Developers tab).`,
        e.status,
      );
    }
    throw e;
  }
  if (!endpoint.secret) throw new MezoutApiError("Mezout did not return a signing secret for the new endpoint", 0);
  await store.saveShop(shop, {
    webhookEndpointId: endpoint.id,
    webhookUrl: url,
    webhookSecret: endpoint.secret,
    webhookKeyHash: keyHash,
  });
  return true;
}

async function deleteQuietly(client: MezoutClient, id: string) {
  try {
    await client.deleteWebhookEndpoint(id);
  } catch (e) {
    // Already gone (404) is fine; anything else is not worth failing the connection for.
    if (!(e instanceof MezoutApiError)) throw e;
  }
}

/**
 * Saves new settings from the settings page. A changed API key is checked first; then the webhook endpoint is
 * registered. Returns an error message for the merchant, or null on success.
 */
export async function saveSettings(opts: {
  store: MezoutStore;
  shop: string;
  appUrl: string;
  clientFor: ClientFactory;
  apiKey?: string;
  gatewayName: string;
  linkLifetimeHours: number;
}): Promise<{ ok: true; registered: boolean } | { ok: false; error: string }> {
  const { store, shop, clientFor } = opts;
  const prev = await store.getShop(shop);
  const newKey = opts.apiKey?.trim() ?? "";
  const keyChanged = newKey !== "" && newKey !== prev?.apiKey;

  if (keyChanged) {
    if (!/^mzk_(test|live)_[A-Za-z0-9_-]+$/.test(newKey)) {
      return { ok: false, error: "That does not look like a Mezout API key. It starts with mzk_test_." };
    }
    try {
      await clientFor(newKey).checkKey();
    } catch (e) {
      if (e instanceof MezoutApiError && e.status === 401) {
        return {
          ok: false,
          error: "Mezout did not accept the API key. Check that you copied all of it and that it has not been revoked.",
        };
      }
      return { ok: false, error: `Could not check the API key: ${e instanceof Error ? e.message : String(e)}` };
    }
    // The old key's endpoint would keep receiving events nobody verifies; remove it while we still have that key.
    if (prev?.apiKey && prev.webhookEndpointId) await deleteQuietly(clientFor(prev.apiKey), prev.webhookEndpointId);
  }

  await store.saveShop(shop, {
    gatewayName: opts.gatewayName.trim(),
    linkLifetimeHours: clampLifetime(opts.linkLifetimeHours),
    ...(keyChanged
      ? { apiKey: newKey, webhookEndpointId: null, webhookUrl: null, webhookSecret: null, webhookKeyHash: null }
      : {}),
  });

  const current = await store.getShop(shop);
  if (!current?.apiKey) return { ok: false, error: "Enter your Mezout API key to connect." };
  try {
    const registered = await ensureWebhookEndpoint({ store, shop, appUrl: opts.appUrl, clientFor });
    return { ok: true, registered };
  } catch (e) {
    return { ok: false, error: `Saved, but ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Payment link lifetime in hours: at least 1, at most 720 (Mezout's 30-day limit). */
export function clampLifetime(hours: number): number {
  if (!Number.isFinite(hours)) return 24;
  return Math.min(720, Math.max(1, Math.round(hours)));
}

/**
 * Writes the app's current URL to a shop metafield (mezout.app_url). The checkout extension reads it to know where to
 * fetch the payment link from, since the dev tunnel URL changes on every run.
 */
export async function publishAppUrl(opts: {
  store: MezoutStore;
  shop: string;
  appUrl: string;
  admin: ShopifyAdmin;
}): Promise<boolean> {
  const { store, shop, appUrl, admin } = opts;
  if (!appUrl) return false;
  const settings = await store.getShop(shop);
  if (settings?.appUrlPublished === appUrl) return false;
  const { id } = await admin.getShop();
  await admin.setMetafields(id, { app_url: appUrl.replace(/\/+$/, "") });
  await store.saveShop(shop, { appUrlPublished: appUrl });
  return true;
}
