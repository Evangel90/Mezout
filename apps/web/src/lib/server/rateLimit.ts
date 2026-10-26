import "server-only";
import { lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, type Db } from "./db/client";
import { rateLimits } from "./db/schema";

/**
 * Counts a request against `key` in a fixed window shared by every server instance (one row per key in Postgres).
 * Returns 0 when the request is allowed, or the seconds until the window resets when it is over `limit`. If the
 * database cannot be reached the request is allowed: the routes behind it need the database anyway.
 */
export async function rateLimited(key: string, limit: number, windowMs: number, db: Db = getDb(), now = Date.now()): Promise<number> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  try {
    const { rows } = (await db.execute(sql`
      insert into ${rateLimits} (key, window_start, count)
      values (${key}, ${new Date(windowStart).toISOString()}::timestamptz, 1)
      on conflict (key) do update set
        count = case when ${rateLimits.windowStart} = excluded.window_start then ${rateLimits.count} + 1 else 1 end,
        window_start = excluded.window_start
      returning count`)) as unknown as { rows: { count: number }[] };
    if (Number(rows[0]?.count ?? 0) <= limit) return 0;
    return Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  } catch (err) {
    console.error("rate limit check failed", err);
    return 0;
  }
}

/** A 429 that says when to retry. */
export function tooManyRequests(retryAfterSeconds: number) {
  const res = NextResponse.json({ error: `Too many requests. Retry in ${retryAfterSeconds} seconds.` }, { status: 429 });
  res.headers.set("Retry-After", String(retryAfterSeconds));
  return res;
}

/** Drops windows older than a day; called by the scheduled job. */
export async function pruneRateLimits(db: Db, now = Date.now()) {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now - 24 * 60 * 60 * 1000)));
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
