import "server-only";
import { waitUntil } from "@vercel/functions";
import { getAddress, type Address } from "viem";
import { mezoTestnetAddresses } from "@mezout/sdk";
import { publicClient } from "./clients";
import { getDb } from "./db/client";
import { serverEnv } from "./env";
import { readCursor, recordExpiries, syncPayments } from "./indexer";
import { allowPrivateWebhooks, webhookSender } from "./webhookSender";
import { dispatchDue } from "./webhooks";

/** Every router whose payments Mezout records: the current one and v1, which still pays older links. */
export function indexedRouters(): Address[] {
  return [...new Set([getAddress(mezoTestnetAddresses.mezoutRouterV1), serverEnv.router()])];
}

export async function syncNow(maxChunks: number) {
  return syncPayments(getDb(), publicClient(), { routers: indexedRouters(), origin: serverEnv.appUrl(), maxChunks });
}

/**
 * Indexes when the last sync is older than maxAgeMs, so reads (an invoice's status, the order list) are current
 * without waiting for the scheduled run. Webhooks for anything new go out after the response.
 */
export async function syncIfStale(maxAgeMs: number) {
  const cursor = await readCursor(getDb());
  if (cursor && Date.now() - cursor.updatedAt.getTime() < maxAgeMs) return null;
  const synced = await syncNow(1);
  if (synced?.recorded) waitUntil(deliverWebhooks(10).catch((err) => console.error("webhook delivery failed", err)));
  return synced;
}

export async function deliverWebhooks(limit = 25) {
  return dispatchDue(getDb(), webhookSender(allowPrivateWebhooks()), serverEnv.webhookSigningSecret(), { limit });
}

/** The scheduled job: index new payments (backfilling if behind), announce expiries, and send due webhooks. */
export async function indexerTick() {
  const synced = await syncNow(10);
  const expired = await recordExpiries(getDb(), serverEnv.appUrl());
  const webhooks = await deliverWebhooks(50);
  return { synced, expired, webhooks };
}
