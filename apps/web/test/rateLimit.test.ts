import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/server/db/client";
import { pruneRateLimits, rateLimited, tooManyRequests } from "@/lib/server/rateLimit";
import { testDb } from "./db";

describe("rate limits", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });
  const t = Date.parse("2026-10-24T12:00:10.000Z");

  it("allows up to the limit per window, then says when to retry", async () => {
    for (let i = 0; i < 3; i++) expect(await rateLimited("k", 3, 60_000, db, t)).toBe(0);
    expect(await rateLimited("k", 3, 60_000, db, t)).toBe(50);
    // Other keys have their own count.
    expect(await rateLimited("other", 3, 60_000, db, t)).toBe(0);
    // A new window starts afresh.
    expect(await rateLimited("k", 3, 60_000, db, t + 50_000)).toBe(0);
  });

  it("sends Retry-After with a 429", () => {
    const res = tooManyRequests(12);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
  });

  it("prunes windows older than a day", async () => {
    await rateLimited("old", 1, 60_000, db, t);
    await pruneRateLimits(db, t + 25 * 60 * 60 * 1000);
    const rows = await db.query.rateLimits.findMany();
    expect(rows).toEqual([]);
  });
});
