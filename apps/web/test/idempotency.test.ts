import { beforeEach, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import type { Merchant } from "@/lib/server/apiKeys";
import type { Db } from "@/lib/server/db/client";
import { IDEMPOTENCY_TTL_MS, withIdempotency } from "@/lib/server/idempotency";
import { testDb } from "./db";
import { makeMerchant } from "./fixtures";

const request = (key: string | null, path = "/v1/invoices") =>
  new Request(`https://mezout.test${path}`, {
    method: "POST",
    headers: key === null ? {} : { "idempotency-key": key },
  });

describe("Idempotency-Key", () => {
  let db: Db;
  let merchant: Merchant;
  let runs: number;
  const handler = (status = 201) => async () => {
    runs++;
    return NextResponse.json({ id: `inv_${runs}` }, { status });
  };

  beforeEach(async () => {
    db = await testDb();
    merchant = await makeMerchant(db);
    runs = 0;
  });

  it("runs once per key and replays the first response", async () => {
    const first = await withIdempotency(db, request("order-1001"), merchant, '{"amount":"1"}', handler());
    const second = await withIdempotency(db, request("order-1001"), merchant, '{"amount":"1"}', handler());
    expect(runs).toBe(1);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("idempotent-replayed")).toBe("true");
  });

  it("runs every time without a key", async () => {
    await withIdempotency(db, request(null), merchant, "{}", handler());
    await withIdempotency(db, request(null), merchant, "{}", handler());
    expect(runs).toBe(2);
  });

  it("refuses a key reused with a different body or path", async () => {
    await withIdempotency(db, request("k"), merchant, '{"amount":"1"}', handler());
    expect((await withIdempotency(db, request("k"), merchant, '{"amount":"2"}', handler())).status).toBe(422);
    expect((await withIdempotency(db, request("k", "/v1/refunds"), merchant, '{"amount":"1"}', handler())).status).toBe(422);
    expect(runs).toBe(1);
  });

  it("keeps keys separate per merchant", async () => {
    await withIdempotency(db, request("k"), merchant, "{}", handler());
    await withIdempotency(db, request("k"), await makeMerchant(db), "{}", handler());
    expect(runs).toBe(2);
  });

  it("replays client errors but lets a server error be retried", async () => {
    await withIdempotency(db, request("bad"), merchant, "{}", handler(400));
    expect((await withIdempotency(db, request("bad"), merchant, "{}", handler())).status).toBe(400);
    expect(runs).toBe(1);

    await withIdempotency(db, request("flaky"), merchant, "{}", handler(500));
    expect((await withIdempotency(db, request("flaky"), merchant, "{}", handler())).status).toBe(201);
    expect(runs).toBe(3);
  });

  it("frees a key whose handler threw", async () => {
    await expect(
      withIdempotency(db, request("boom"), merchant, "{}", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await withIdempotency(db, request("boom"), merchant, "{}", handler())).status).toBe(201);
  });

  it("answers 409 while the first request is still running", async () => {
    let release!: () => void;
    const slow = withIdempotency(db, request("slow"), merchant, "{}", async () => {
      await new Promise<void>((r) => (release = r));
      return NextResponse.json({ ok: true }, { status: 201 });
    });
    await new Promise((r) => setTimeout(r, 50));
    expect((await withIdempotency(db, request("slow"), merchant, "{}", handler())).status).toBe(409);
    release();
    expect((await slow).status).toBe(201);
  });

  it("forgets keys after 24 hours", async () => {
    const t = Date.now();
    await withIdempotency(db, request("old"), merchant, "{}", handler(), t);
    await withIdempotency(db, request("old"), merchant, '{"other":1}', handler(), t + IDEMPOTENCY_TTL_MS + 1);
    expect(runs).toBe(2);
  });

  it("rejects malformed keys", async () => {
    expect((await withIdempotency(db, request("has space"), merchant, "{}", handler())).status).toBe(400);
    expect((await withIdempotency(db, request("x".repeat(256)), merchant, "{}", handler())).status).toBe(400);
  });
});
