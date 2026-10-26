import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Merchant } from "./apiKeys";
import { sha256 } from "./apiKeys";
import type { Db } from "./db/client";
import { idempotencyKeys } from "./db/schema";

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

/**
 * Runs a POST /v1 handler at most once per Idempotency-Key and merchant. The first response (unless it is a 5xx,
 * which may succeed on retry) is stored for 24 hours and replayed for the same key, with `Idempotent-Replayed: true`.
 * A key reused with a different method, path or body is refused (422), as is one whose first request is still
 * running (409). Without the header the handler simply runs.
 */
export async function withIdempotency(
  db: Db,
  req: Request,
  merchant: Merchant,
  rawBody: string,
  handler: () => Promise<NextResponse>,
  now = Date.now(),
): Promise<NextResponse> {
  const key = req.headers.get("idempotency-key");
  if (key === null) return handler();
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: "Idempotency-Key must be 1 to 255 printable ASCII characters" }, { status: 400 });
  }
  const requestHash = sha256(`${req.method} ${new URL(req.url).pathname}\n${rawBody}`);
  const where = and(eq(idempotencyKeys.merchantId, merchant.id), eq(idempotencyKeys.key, key));

  // A key older than the replay window starts afresh.
  await db.delete(idempotencyKeys).where(and(where, lt(idempotencyKeys.createdAt, new Date(now - IDEMPOTENCY_TTL_MS))));
  const claimed = await db
    .insert(idempotencyKeys)
    .values({ merchantId: merchant.id, key, requestHash, createdAt: new Date(now) })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (claimed.length === 0) {
    const [prior] = await db.select().from(idempotencyKeys).where(where);
    if (!prior || prior.requestHash !== requestHash) {
      return NextResponse.json(
        { error: "This Idempotency-Key was already used for a different request. Use a new key." },
        { status: 422 },
      );
    }
    if (prior.status === null) {
      return NextResponse.json({ error: "A request with this Idempotency-Key is still in progress. Retry shortly." }, { status: 409 });
    }
    const replay = NextResponse.json(prior.body, { status: prior.status });
    replay.headers.set("Idempotent-Replayed", "true");
    return replay;
  }

  let res: NextResponse;
  try {
    res = await handler();
  } catch (err) {
    await db.delete(idempotencyKeys).where(where);
    throw err;
  }
  if (res.status >= 500) {
    await db.delete(idempotencyKeys).where(where);
  } else {
    const body = await res.clone().json().catch(() => null);
    await db.update(idempotencyKeys).set({ status: res.status, body }).where(where);
  }
  return res;
}
