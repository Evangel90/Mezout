import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Merchant } from "./apiKeys";
import type { Db } from "./db/client";
import { webhookAttempts, webhookDeliveries, webhookEndpoints, webhookEvents } from "./db/schema";
import { checkEndpointUrl } from "./webhookSender";
import { endpointSecret, MAX_ENDPOINTS, newId } from "./webhooks";

type EndpointRow = typeof webhookEndpoints.$inferSelect;

export class EndpointError extends Error {}

export function endpointJson(e: EndpointRow, secret?: string) {
  return {
    id: e.id,
    object: "webhook_endpoint",
    url: e.url,
    ...(secret ? { secret } : {}),
    created_at: e.createdAt.toISOString(),
  };
}

export async function createEndpoint(
  db: Db,
  merchant: Merchant,
  rawUrl: string,
  platformSecret: string,
  allowPrivate: boolean,
): Promise<{ endpoint: EndpointRow; secret: string }> {
  let url: string;
  try {
    url = checkEndpointUrl(rawUrl, allowPrivate);
  } catch (err) {
    throw new EndpointError(err instanceof Error ? err.message : "Invalid url");
  }
  const active = await activeEndpoints(db, merchant);
  if (active.length >= MAX_ENDPOINTS) throw new EndpointError(`A merchant can have at most ${MAX_ENDPOINTS} webhook endpoints.`);
  const [endpoint] = await db.insert(webhookEndpoints).values({ id: newId("we"), merchantId: merchant.id, url }).returning();
  return { endpoint, secret: endpointSecret(platformSecret, endpoint.id) };
}

export function activeEndpoints(db: Db, merchant: Merchant): Promise<EndpointRow[]> {
  return db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.merchantId, merchant.id), isNull(webhookEndpoints.disabledAt)))
    .orderBy(webhookEndpoints.createdAt);
}

export async function findEndpoint(db: Db, merchant: Merchant, id: string): Promise<EndpointRow | null> {
  const [row] = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.merchantId, merchant.id), isNull(webhookEndpoints.disabledAt)));
  return row ?? null;
}

/** Stops deliveries to an endpoint. Its queued deliveries fail on their next attempt. */
export async function disableEndpoint(db: Db, merchant: Merchant, id: string): Promise<boolean> {
  const rows = await db
    .update(webhookEndpoints)
    .set({ disabledAt: new Date() })
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.merchantId, merchant.id), isNull(webhookEndpoints.disabledAt)))
    .returning({ id: webhookEndpoints.id });
  return rows.length > 0;
}

/** The delivery log for one endpoint: every attempt, newest first. */
export async function endpointAttempts(db: Db, endpointId: string, limit = 50) {
  const rows = await db
    .select({ attempt: webhookAttempts, delivery: webhookDeliveries, event: webhookEvents })
    .from(webhookAttempts)
    .innerJoin(webhookDeliveries, eq(webhookAttempts.deliveryId, webhookDeliveries.id))
    .innerJoin(webhookEvents, eq(webhookDeliveries.eventId, webhookEvents.id))
    .where(eq(webhookDeliveries.endpointId, endpointId))
    .orderBy(desc(webhookAttempts.createdAt))
    .limit(limit);
  return rows.map(({ attempt, delivery, event }) => ({
    event_id: event.id,
    event_type: event.type,
    attempt: attempt.attempt,
    status_code: attempt.statusCode,
    error: attempt.error,
    response: attempt.responseExcerpt,
    duration_ms: attempt.durationMs,
    at: attempt.createdAt.toISOString(),
    delivery_status: delivery.status,
    next_attempt_at: delivery.status === "pending" ? delivery.nextAttemptAt.toISOString() : null,
    delivery_id: delivery.id,
  }));
}

/** Queues a failed delivery for another try now. Only the endpoint's merchant can do this. */
export async function retryDelivery(db: Db, endpointId: string, deliveryId: string): Promise<boolean> {
  const rows = await db
    .update(webhookDeliveries)
    .set({ status: "pending", nextAttemptAt: new Date() })
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.status, "failed")))
    .returning({ id: webhookDeliveries.id });
  return rows.length > 0;
}
