import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { webhookAttempts, webhookDeliveries, webhookEndpoints, webhookEvents } from "./db/schema";

export type EventType = "invoice.paid" | "invoice.expired" | "refund.completed" | "ping";
export const MAX_ENDPOINTS = 3;
export const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
// A claimed delivery is hidden from other dispatchers for this long, in case the one sending it dies.
const CLAIM_LEASE_MS = 2 * 60 * 1000;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type EventRow = typeof webhookEvents.$inferSelect;

export const newId = (prefix: string) => `${prefix}_${randomBytes(12).toString("hex")}`;

/** whsec_… for an endpoint, derived from the platform secret so none is stored. */
export function endpointSecret(platformSecret: string, endpointId: string): string {
  return "whsec_" + createHmac("sha256", platformSecret).update(`webhook-endpoint:${endpointId}`).digest("base64url");
}

/** The Mezout-Signature header: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">. */
export function signatureHeader(secret: string, body: string, timestamp: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

/** The JSON body sent to the merchant. It is identical on every retry; only the signature's timestamp changes. */
export function eventBody(event: EventRow): string {
  return JSON.stringify({
    id: event.id,
    object: "event",
    type: event.type,
    created_at: event.createdAt.toISOString(),
    data: event.data,
  });
}

/**
 * Records an event once per dedupeKey and queues a delivery to each of the merchant's active endpoints (or just
 * `onlyEndpoint`). Returns the event id, or null when it was already recorded.
 */
export async function recordEvent(
  db: Db | Tx,
  merchantId: string,
  type: EventType,
  dedupeKey: string,
  object: unknown,
  opts: { onlyEndpoint?: string; now?: Date } = {},
): Promise<string | null> {
  const now = opts.now ?? new Date();
  const [event] = await db
    .insert(webhookEvents)
    .values({ id: newId("evt"), merchantId, type, dedupeKey, data: { object }, createdAt: now })
    .onConflictDoNothing({ target: webhookEvents.dedupeKey })
    .returning({ id: webhookEvents.id });
  if (!event) return null;
  const endpoints = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.merchantId, merchantId),
        isNull(webhookEndpoints.disabledAt),
        opts.onlyEndpoint ? eq(webhookEndpoints.id, opts.onlyEndpoint) : undefined,
      ),
    );
  if (endpoints.length > 0) {
    await db
      .insert(webhookDeliveries)
      .values(endpoints.map((e) => ({ eventId: event.id, endpointId: e.id, nextAttemptAt: now, createdAt: now })));
  }
  return event.id;
}

export type SendResult = { statusCode: number; body: string };
export type Sender = (url: string, body: string, headers: Record<string, string>) => Promise<SendResult>;

/** When to try again after `attempts` failures, or null once the 24-hour window is used up. */
export function nextAttemptAt(eventCreatedAt: Date, attempts: number, now: Date): Date | null {
  const delay = Math.min(60_000 * 2 ** (attempts - 1), MAX_RETRY_DELAY_MS);
  const next = new Date(now.getTime() + delay);
  return next.getTime() - eventCreatedAt.getTime() > RETRY_WINDOW_MS ? null : next;
}

/** Sends every delivery that is due, at most `limit`, and logs each attempt. Safe to run concurrently. */
export async function dispatchDue(
  db: Db,
  send: Sender,
  platformSecret: string,
  opts: { limit?: number; now?: () => Date } = {},
): Promise<{ sent: number; succeeded: number }> {
  const now = opts.now ?? (() => new Date());
  const claimedAt = now();
  const lease = new Date(claimedAt.getTime() + CLAIM_LEASE_MS);
  // node-postgres and PGlite both return { rows }.
  const claimed = (await db.execute(sql`
    update ${webhookDeliveries} set next_attempt_at = ${lease.toISOString()}
    where id in (
      select id from ${webhookDeliveries}
      where status = 'pending' and next_attempt_at <= ${claimedAt.toISOString()}
      order by next_attempt_at
      limit ${opts.limit ?? 25}
      for update skip locked
    )
    returning id`)) as unknown as { rows: { id: string }[] };
  const ids = claimed.rows.map((r) => r.id);
  if (ids.length === 0) return { sent: 0, succeeded: 0 };

  const rows = await db
    .select({ delivery: webhookDeliveries, event: webhookEvents, endpoint: webhookEndpoints })
    .from(webhookDeliveries)
    .innerJoin(webhookEvents, eq(webhookDeliveries.eventId, webhookEvents.id))
    .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
    .where(inArray(webhookDeliveries.id, ids));

  const results = await Promise.all(
    rows.map(async ({ delivery, event, endpoint }) => {
      const attempt = delivery.attempts + 1;
      if (endpoint.disabledAt) {
        await db.update(webhookDeliveries).set({ status: "failed" }).where(eq(webhookDeliveries.id, delivery.id));
        return false;
      }
      const body = eventBody(event);
      const started = Date.now();
      let statusCode: number | null = null;
      let excerpt: string | null = null;
      let error: string | null = null;
      try {
        const res = await send(endpoint.url, body, {
          "content-type": "application/json",
          "user-agent": "Mezout-Webhooks/1",
          "mezout-event-id": event.id,
          "mezout-event-type": event.type,
          "mezout-signature": signatureHeader(
            endpointSecret(platformSecret, endpoint.id),
            body,
            Math.floor(now().getTime() / 1000),
          ),
        });
        statusCode = res.statusCode;
        excerpt = res.body.slice(0, 500) || null;
        if (statusCode < 200 || statusCode >= 300) error = `HTTP ${statusCode}`;
      } catch (err) {
        error = err instanceof Error ? err.message.slice(0, 300) : "Request failed";
      }
      const ok = error === null;
      const finished = now();
      const retryAt = ok ? null : nextAttemptAt(event.createdAt, attempt, finished);
      await db.insert(webhookAttempts).values({
        deliveryId: delivery.id,
        attempt,
        statusCode,
        error,
        responseExcerpt: excerpt,
        durationMs: Date.now() - started,
        createdAt: finished,
      });
      await db
        .update(webhookDeliveries)
        .set({
          attempts: attempt,
          status: ok ? "succeeded" : retryAt ? "pending" : "failed",
          nextAttemptAt: retryAt ?? finished,
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      return ok;
    }),
  );
  return { sent: results.length, succeeded: results.filter(Boolean).length };
}
