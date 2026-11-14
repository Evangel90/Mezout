import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loanAlertsSubscribeMessage, loanAlertsUnsubscribeMessage } from "@mezout/sdk";
import type { Db } from "@/lib/server/db/client";
import { testDb } from "./db";

// The route with its outside world replaced: an in-memory database, a wallet check with plain ECDSA, a Mezo read
// that says every wallet has a loan, and an alert sender that always succeeds.
const state = vi.hoisted(() => ({ db: null as unknown as Db, sent: [] as string[] }));
vi.mock("@/lib/server/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/lib/server/ownership", () => ({ ownershipVerifier: async () => verifyMessage }));
vi.mock("@/lib/server/clients", () => ({ publicClient: () => ({ readContract: async () => 1 }) }));
vi.mock("@/lib/server/webhookSender", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/webhookSender")>()),
  allowPrivateWebhooks: () => true,
  webhookSender: () => async (url: string) => {
    state.sent.push(url);
    return { statusCode: 200, body: "" };
  },
}));

const { DELETE, GET, POST } = await import("@/app/api/loan-alerts/route");

const borrower = privateKeyToAccount(generatePrivateKey());
const url = "https://hooks.example/loan";
const settings = { url, thresholds: [180, 165], redemption: true };
const req = (method: string, body: unknown, ip = "198.51.100.7") =>
  new Request("https://mezout.test/api/loan-alerts", { method, headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: JSON.stringify(body) });
async function subscribeBody(at = Date.now()) {
  const issuedAt = new Date(at).toISOString();
  return { address: borrower.address, issuedAt, ...settings, signature: await borrower.signMessage({ message: loanAlertsSubscribeMessage(borrower.address, settings, issuedAt) }) };
}

describe("/api/loan-alerts", () => {
  beforeEach(async () => {
    state.db = await testDb();
    state.sent = [];
  });

  it("subscribes, shows status without the URL, and unsubscribes", async () => {
    const res = await POST(req("POST", await subscribeBody()));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ active: true, thresholds: [180, 165], redemption: true });
    expect(state.sent).toEqual([url]);

    const status = await GET(new Request(`https://mezout.test/api/loan-alerts?address=${borrower.address}`));
    const text = await status.text();
    expect(JSON.parse(text).active).toBe(true);
    expect(text).not.toContain("hooks.example");

    const issuedAt = new Date(Date.now() + 1000).toISOString();
    const off = await DELETE(
      req("DELETE", { address: borrower.address, issuedAt, signature: await borrower.signMessage({ message: loanAlertsUnsubscribeMessage(borrower.address, issuedAt) }) }),
    );
    expect(await off.json()).toMatchObject({ active: false, stopped: true });
  });

  it("answers 400 to malformed or badly signed requests", async () => {
    expect((await POST(req("POST", { address: "nope" }))).status).toBe(400);
    expect((await POST(new Request("https://mezout.test/api/loan-alerts", { method: "POST", body: "{" }))).status).toBe(400);
    const body = await subscribeBody();
    const forged = await POST(req("POST", { ...body, url: "https://elsewhere.example/x" }));
    expect(forged.status).toBe(400);
    expect((await forged.json()).error).toMatch(/does not match/);
    expect((await GET(new Request("https://mezout.test/api/loan-alerts?address=0x12"))).status).toBe(400);
  });

  it("limits signed requests per wallet and per IP", async () => {
    // Five per wallet in ten minutes, from different IPs.
    for (let i = 0; i < 5; i++) {
      const res = await POST(req("POST", { ...(await subscribeBody()), signature: "0x00" }, `198.51.100.${i}`));
      expect(res.status).toBe(400);
    }
    const limited = await POST(req("POST", await subscribeBody(), "198.51.100.99"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    // Ten per IP a minute, across wallets.
    for (let i = 0; i < 10; i++) {
      const other = privateKeyToAccount(generatePrivateKey());
      await POST(req("POST", { ...(await subscribeBody()), address: other.address }, "203.0.113.1"));
    }
    expect((await POST(req("POST", await subscribeBody(), "203.0.113.1"))).status).toBe(429);
  });
});
