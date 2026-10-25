import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/server/db/client";
import { webhookAttempts, webhookDeliveries, webhookEndpoints } from "@/lib/server/db/schema";
import { checkEndpointUrl, isPrivateAddress, webhookSender } from "@/lib/server/webhookSender";
import {
  dispatchDue,
  endpointSecret,
  eventBody,
  nextAttemptAt,
  recordEvent,
  RETRY_WINDOW_MS,
  signatureHeader,
  type Sender,
} from "@/lib/server/webhooks";
import { testDb } from "./db";
import { makeEndpoint, makeMerchant, PLATFORM_SECRET } from "./fixtures";

type Call = { url: string; body: string; headers: Record<string, string> };
const recorder = (statusCodes: number[]) => {
  const calls: Call[] = [];
  const send: Sender = async (url, body, headers) => {
    calls.push({ url, body, headers });
    const statusCode = statusCodes[Math.min(calls.length - 1, statusCodes.length - 1)];
    return { statusCode, body: statusCode === 200 ? "ok" : "nope" };
  };
  return { calls, send };
};

describe("webhook signing", () => {
  it("signs t.body with the endpoint's secret", () => {
    const secret = endpointSecret(PLATFORM_SECRET, "we_1");
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(endpointSecret(PLATFORM_SECRET, "we_2")).not.toBe(secret);
    const body = '{"id":"evt_1"}';
    const header = signatureHeader(secret, body, 1_700_000_000);
    const expected = createHmac("sha256", secret).update(`1700000000.${body}`).digest("hex");
    expect(header).toBe(`t=1700000000,v1=${expected}`);
  });

  it("backs off exponentially and stops 24 hours after the event", () => {
    const created = new Date("2026-10-26T00:00:00Z");
    expect(nextAttemptAt(created, 1, created)?.getTime()).toBe(created.getTime() + 60_000);
    expect(nextAttemptAt(created, 3, created)?.getTime()).toBe(created.getTime() + 4 * 60_000);
    expect(nextAttemptAt(created, 20, created)?.getTime()).toBe(created.getTime() + 6 * 3600_000); // capped
    const late = new Date(created.getTime() + RETRY_WINDOW_MS - 30_000);
    expect(nextAttemptAt(created, 2, late)).toBeNull();
  });
});

describe("webhook delivery", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("delivers a signed event once and logs the attempt", async () => {
    const merchant = await makeMerchant(db);
    const endpoint = await makeEndpoint(db, merchant);
    const id = await recordEvent(db, merchant.id, "invoice.paid", "invoice.paid:inv_1", { id: "inv_1" });
    expect(await recordEvent(db, merchant.id, "invoice.paid", "invoice.paid:inv_1", { id: "inv_1" })).toBeNull();

    const { calls, send } = recorder([200]);
    expect(await dispatchDue(db, send, PLATFORM_SECRET)).toEqual({ sent: 1, succeeded: 1 });
    expect(await dispatchDue(db, send, PLATFORM_SECRET)).toEqual({ sent: 0, succeeded: 0 });

    const [call] = calls;
    expect(call.url).toBe(endpoint.url);
    expect(JSON.parse(call.body)).toMatchObject({ id, object: "event", type: "invoice.paid", data: { object: { id: "inv_1" } } });
    expect(call.headers["mezout-event-id"]).toBe(id);
    const [, t, v1] = call.headers["mezout-signature"].match(/^t=(\d+),v1=([0-9a-f]{64})$/)!;
    const secret = endpointSecret(PLATFORM_SECRET, endpoint.id);
    expect(v1).toBe(createHmac("sha256", secret).update(`${t}.${call.body}`).digest("hex"));

    const [delivery] = await db.select().from(webhookDeliveries);
    expect(delivery).toMatchObject({ status: "succeeded", attempts: 1 });
    const [attempt] = await db.select().from(webhookAttempts);
    expect(attempt).toMatchObject({ attempt: 1, statusCode: 200, error: null, responseExcerpt: "ok" });
  });

  it("retries failures with the same body, then gives up after 24 hours", async () => {
    const merchant = await makeMerchant(db);
    await makeEndpoint(db, merchant);
    const t0 = new Date("2026-10-26T00:00:00Z");
    await recordEvent(db, merchant.id, "invoice.paid", "k", { id: "inv_1" }, { now: t0 });
    let clock = t0.getTime();
    const now = () => new Date(clock);
    const { calls, send } = recorder([500]);

    await dispatchDue(db, send, PLATFORM_SECRET, { now });
    let [delivery] = await db.select().from(webhookDeliveries);
    expect(delivery).toMatchObject({ status: "pending", attempts: 1 });
    expect(delivery.nextAttemptAt.getTime()).toBe(clock + 60_000);

    // Not due yet: nothing is sent.
    clock += 30_000;
    expect((await dispatchDue(db, send, PLATFORM_SECRET, { now })).sent).toBe(0);

    while (delivery.status === "pending") {
      clock = delivery.nextAttemptAt.getTime();
      await dispatchDue(db, send, PLATFORM_SECRET, { now });
      [delivery] = await db.select().from(webhookDeliveries);
    }
    expect(delivery.status).toBe("failed");
    expect(clock - t0.getTime()).toBeLessThanOrEqual(RETRY_WINDOW_MS);
    expect(new Set(calls.map((c) => c.body)).size).toBe(1);
    expect(await db.select().from(webhookAttempts)).toHaveLength(calls.length);
    expect((await db.select().from(webhookAttempts)).every((a) => a.error === "HTTP 500")).toBe(true);
  });

  it("marks a delivery to a deleted endpoint as failed without sending it", async () => {
    const merchant = await makeMerchant(db);
    const endpoint = await makeEndpoint(db, merchant);
    await recordEvent(db, merchant.id, "invoice.paid", "k", {});
    await db.update(webhookEndpoints).set({ disabledAt: new Date() }).where(eq(webhookEndpoints.id, endpoint.id));
    const { calls, send } = recorder([200]);
    await dispatchDue(db, send, PLATFORM_SECRET);
    expect(calls).toHaveLength(0);
    expect((await db.select().from(webhookDeliveries))[0].status).toBe("failed");
  });

  it("keeps the event body stable across retries", async () => {
    const merchant = await makeMerchant(db);
    await recordEvent(db, merchant.id, "ping", "p", { a: 1 });
    const rows = await db.query.webhookEvents.findMany();
    expect(eventBody(rows[0])).toBe(eventBody(rows[0]));
  });
});

describe("webhook endpoint URLs", () => {
  it("accepts only public https URLs in production", () => {
    expect(checkEndpointUrl("https://shop.example/mezout/webhook", false)).toBe("https://shop.example/mezout/webhook");
    for (const bad of [
      "http://shop.example/hook",
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://10.1.2.3/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/hook",
      "https://user:pass@shop.example/hook",
      "ftp://shop.example",
      "not a url",
    ]) {
      expect(() => checkEndpointUrl(bad, false), bad).toThrow();
    }
  });

  it("allows local stores in development", () => {
    expect(checkEndpointUrl("http://localhost:8080/?wc-api=mezout", true)).toBe("http://localhost:8080/?wc-api=mezout");
  });

  it("classifies private addresses, including IPv4-mapped IPv6", () => {
    for (const a of ["127.0.0.1", "10.0.0.1", "172.20.1.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
    for (const a of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(a), a).toBe(false);
  });
});

describe("webhook sender", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "http://169.254.169.254/" }).end();
        return;
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => res.writeHead(200).end(`got ${body.length} bytes; sig=${req.headers["mezout-signature"]}`));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("refuses hosts that resolve to private addresses", async () => {
    await expect(webhookSender(false)(`${base}/hook`, "{}", {})).rejects.toThrow();
    await expect(webhookSender(false)(base.replace("localhost", "127.0.0.1") + "/hook", "{}", {})).rejects.toThrow(/private/);
  });

  it("posts the body and reads the answer when private hosts are allowed", async () => {
    const res = await webhookSender(true)(`${base}/hook`, '{"a":1}', { "mezout-signature": "t=1,v1=x" });
    expect(res).toEqual({ statusCode: 200, body: "got 7 bytes; sig=t=1,v1=x" });
  });

  it("does not follow redirects", async () => {
    const res = await webhookSender(true)(`${base}/redirect`, "{}", {});
    expect(res.statusCode).toBe(302);
  });
});
