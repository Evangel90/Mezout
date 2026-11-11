import { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { decodeX402Header, encodeX402Header, mezoTestnetAddresses, type X402PaymentRequired, type X402SettlementResponse } from "@mezout/sdk";
import { createMusdPayer, fetchWithPayment, PaymentRefused } from "./client";
import { resourceReference } from "./core";
import { mezout402 } from "./express";
import { withMezout402 } from "./next";
import { API_KEY, APP, FakeMezout, MERCHANT } from "./test-fakes";

function setup(opts: { price?: string; maxPerPayment?: string; maxPerSession?: string; balance?: string; chainId?: number } = {}) {
  const mezout = new FakeMezout();
  const handler = withMezout402(
    { apiKey: API_KEY, apiUrl: APP, price: opts.price ?? "0.05", description: "A report", fetch: mezout.fetch },
    async (_req, _ctx, payment) => Response.json({ report: "secret data", paidBy: payment.payer }),
  );
  // The merchant's API, reachable by the agent's fetch.
  const merchantFetch = (async (input: string | URL | Request, init?: RequestInit) =>
    handler(new Request(input as string, init), {})) as typeof fetch;
  const account = privateKeyToAccount(generatePrivateKey());
  const payer = createMusdPayer({
    account,
    appUrl: APP,
    maxPerPayment: opts.maxPerPayment ?? "1",
    maxPerSession: opts.maxPerSession ?? "2",
    chain: mezout.chain({ balance: opts.balance, chainId: opts.chainId }),
    fetch: mezout.fetch,
  });
  return { mezout, handler, merchantFetch, payer, account };
}

describe("paywall (Next.js handler)", () => {
  it("answers 402 with an x402 v2 PAYMENT-REQUIRED for a Mezout invoice", async () => {
    const { handler, mezout } = setup();
    const res = await handler(new Request("https://api.shop.test/report?x=1"), {});
    expect(res.status).toBe(402);
    const required = decodeX402Header<X402PaymentRequired>(res.headers.get("PAYMENT-REQUIRED")!);
    expect(await res.json()).toEqual(required);
    expect(required).toMatchObject({
      x402Version: 2,
      resource: { url: "https://api.shop.test/report?x=1", description: "A report" },
      accepts: [
        {
          scheme: "mezout",
          network: "eip155:31611",
          amount: "50000000000000000",
          asset: mezoTestnetAddresses.musd,
          payTo: MERCHANT,
          extra: { name: "Mezo USD", version: "1", router: mezoTestnetAddresses.mezoutRouterV3, relayUrl: `${APP}/api/relay` },
        },
      ],
    });
    const [inv] = mezout.invoices.values();
    expect(inv.reference).toBe("402 GET /report");
    expect(required.accepts[0].maxTimeoutSeconds).toBeGreaterThan(590);
  });

  it("completes the 402 flow end to end, and each invoice unlocks one request", async () => {
    const { merchantFetch, payer, mezout, account } = setup();
    const { response, payment } = await fetchWithPayment("https://api.shop.test/report", { payer, fetch: merchantFetch });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ report: "secret data", paidBy: account.address });
    expect(payment).toMatchObject({ amount: "0.05", payer: account.address, merchant: MERCHANT });
    expect(payment!.settlement).toEqual<X402SettlementResponse>({
      success: true,
      transaction: payment!.transaction,
      network: "eip155:31611",
      payer: account.address,
    });
    expect(payer.budget()).toMatchObject({ spent: "0.05", remaining: "1.95" });

    // Replaying the same proof is refused with a fresh payment request.
    const proof = encodeX402Header({
      x402Version: 2,
      accepted: { scheme: "mezout" },
      payload: { invoice: payment!.invoice, transaction: payment!.transaction },
    });
    const replay = await merchantFetch("https://api.shop.test/report", { headers: { "PAYMENT-SIGNATURE": proof } });
    expect(replay.status).toBe(402);
    expect(decodeX402Header<X402PaymentRequired>(replay.headers.get("PAYMENT-REQUIRED")!).error).toMatch(/already been used/);
    expect(mezout.invoices.size).toBe(2);

    // The proof does not unlock another path either.
    const other = await merchantFetch("https://api.shop.test/other", { headers: { "PAYMENT-SIGNATURE": proof } });
    expect(other.status).toBe(402);
  });

  it("rejects proof of an unpaid invoice by offering that same invoice again", async () => {
    const { handler, mezout } = setup();
    await handler(new Request("https://api.shop.test/report"), {});
    const [inv] = mezout.invoices.values();
    const proof = encodeX402Header({ x402Version: 2, accepted: { scheme: "mezout" }, payload: { invoice: inv.id, transaction: `0x${"1".repeat(64)}` } });
    const res = await handler(new Request("https://api.shop.test/report", { headers: { "PAYMENT-SIGNATURE": proof } }), {});
    expect(res.status).toBe(402);
    expect(decodeX402Header<X402PaymentRequired>(res.headers.get("PAYMENT-REQUIRED")!).accepts[0].extra).toMatchObject({ invoice: inv.id });
  });

  it("answers 400 for a malformed payment header", async () => {
    const { handler } = setup();
    const res = await handler(new Request("https://api.shop.test/report", { headers: { "PAYMENT-SIGNATURE": "%%%" } }), {});
    expect(res.status).toBe(400);
  });
});

describe("payer limits and safety", () => {
  it("refuses a payment over the per-payment cap without signing", async () => {
    const { merchantFetch, payer, mezout } = setup({ price: "5", maxPerPayment: "1" });
    await expect(fetchWithPayment("https://api.shop.test/report", { payer, fetch: merchantFetch })).rejects.toThrow(/per-payment limit/);
    expect(mezout.relayBodies).toHaveLength(0);
  });

  it("stops at the session cap", async () => {
    const { merchantFetch, payer } = setup({ price: "0.6", maxPerPayment: "1", maxPerSession: "1" });
    expect((await fetchWithPayment("https://api.shop.test/report", { payer, fetch: merchantFetch })).response.status).toBe(200);
    await expect(fetchWithPayment("https://api.shop.test/report", { payer, fetch: merchantFetch })).rejects.toThrow(/session limit/);
    expect(payer.budget()).toMatchObject({ spent: "0.6", remaining: "0.4" });
  });

  it("refuses any chain but Mezo testnet, and releases the reservation", async () => {
    const { merchantFetch, payer } = setup({ chainId: 1 });
    await expect(fetchWithPayment("https://api.shop.test/report", { payer, fetch: merchantFetch })).rejects.toThrow(/31611/);
    expect(payer.budget().remaining).toBe("2");
  });

  it("refuses links naming an unknown router (a permit to it could be drained)", async () => {
    const { merchantFetch, payer, mezout } = setup();
    mezout.router = "0x000000000000000000000000000000000000dEaD";
    await expect(fetchWithPayment("https://api.shop.test/report", { payer, fetch: merchantFetch })).rejects.toBeInstanceOf(PaymentRefused);
    expect(mezout.relayBodies).toHaveLength(0);
  });

  it("refuses when the balance is short", async () => {
    const { merchantFetch, payer } = setup({ balance: "0.01" });
    await expect(fetchWithPayment("https://api.shop.test/report", { payer, fetch: merchantFetch })).rejects.toThrow(/holds 0.01 MUSD/);
  });

  it("never returns signatures or keys", async () => {
    const { merchantFetch, payer, mezout } = setup();
    const result = await fetchWithPayment("https://api.shop.test/report", { payer, fetch: merchantFetch });
    const relayed = mezout.relayBodies[0] as { payerSig: string; permit: { r: string; s: string } };
    const out = JSON.stringify(result.payment);
    expect(out).not.toContain(relayed.payerSig.slice(2, 40));
    expect(out).not.toContain(relayed.permit.r.slice(2));
    expect(out).not.toContain(relayed.permit.s.slice(2));
  });
});

describe("Express middleware", () => {
  it("guards a route and lets a paid request through with req.mezout", async () => {
    const mezout = new FakeMezout();
    const app = express();
    app.get("/report", mezout402({ apiKey: API_KEY, apiUrl: APP, price: "0.05", fetch: mezout.fetch }), (req, res) => {
      res.json({ ok: true, invoice: req.mezout?.invoice });
    });
    const server = app.listen(0);
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/report`;
      const unpaid = await fetch(url);
      expect(unpaid.status).toBe(402);
      expect(unpaid.headers.get("payment-required")).toBeTruthy();

      const payer = createMusdPayer({
        account: privateKeyToAccount(generatePrivateKey()),
        appUrl: APP,
        maxPerPayment: "1",
        maxPerSession: "1",
        chain: mezout.chain(),
        fetch: mezout.fetch,
      });
      const { response, payment } = await fetchWithPayment(url, { payer });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, invoice: payment!.invoice });
      expect(response.headers.get("payment-response")).toBeTruthy();
      expect([...mezout.invoices.values()].find((i) => i.id === payment!.invoice)?.reference).toBe(resourceReference("GET", url));
    } finally {
      server.close();
    }
  });
});
