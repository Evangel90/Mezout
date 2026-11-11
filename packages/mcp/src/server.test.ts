import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { withMezout402 } from "@mezout/paywall/next";
import { API_KEY, APP, FakeMezout } from "@mezout/paywall/testing";
import { loadConfig, type Config } from "./config";
import { createMezoutServer } from "./server";

async function connect(config: Partial<Config> = {}, opts: { balance?: string; chainId?: number } = {}) {
  const mezout = new FakeMezout();
  const payerKey = generatePrivateKey();
  const full: Config = {
    apiUrl: APP,
    apiKey: API_KEY,
    payerKey,
    rpcUrl: "http://unused",
    maxPerPayment: "1",
    maxPerSession: "2",
    ...config,
  };
  // A merchant API behind a Mezout paywall, reachable through the same fake network as Mezout itself.
  const paywalled = withMezout402({ apiKey: API_KEY, apiUrl: APP, price: "0.05", fetch: mezout.fetch }, async () =>
    Response.json({ answer: 42 }),
  );
  const network = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.example.test/")) return paywalled(new Request(url, init), {});
    return mezout.fetch(input, init);
  }) as typeof fetch;

  const server = createMezoutServer(full, { fetch: network, chain: mezout.chain(opts) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
    const text = res.content[0].text;
    let value: unknown = text;
    try {
      value = JSON.parse(text);
    } catch {
      /* plain-text error */
    }
    return { isError: !!res.isError, value: value as Record<string, any>, text };
  };
  return { client, call, mezout, payer: privateKeyToAccount(payerKey), payerKey };
}

describe("Mezout MCP server", () => {
  it("lists the tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["create_invoice", "fetch_paid_resource", "get_budget", "get_invoice", "list_invoices", "pay_invoice", "refund", "verify_payment"].sort(),
    );
  });

  it("creates, pays, reads, lists and refunds an invoice", async () => {
    const { call, payer } = await connect();
    const created = await call("create_invoice", { amount: "0.25", reference: "Agent order 1" });
    expect(created.isError).toBe(false);
    expect(created.value).toMatchObject({ amount: "0.25", reference: "Agent order 1", status: "pending" });

    const paid = await call("pay_invoice", { checkout_url: created.value.checkout_url });
    expect(paid.value).toMatchObject({ status: "paid", amount: "0.25", payer: payer.address, budget: { spent: "0.25", remaining: "1.75" } });
    expect(paid.value.transaction).toMatch(/^0x[0-9a-f]{64}$/);

    expect((await call("get_invoice", { id: created.value.id })).value).toMatchObject({ status: "paid" });
    expect((await call("list_invoices", { limit: 5 })).value.data).toHaveLength(1);
    expect((await call("verify_payment", { invoice: created.value.id })).value).toMatchObject({ isValid: true, payer: payer.address });
    expect((await call("refund", { invoice: created.value.id, amount: "0.1" })).value).toMatchObject({ status: "pending", amount: "0.1" });
  });

  it("refuses to pay over the limits, and an explicit max_amount", async () => {
    const { call, mezout } = await connect({ maxPerPayment: "1", maxPerSession: "1.5" });
    const big = await call("create_invoice", { amount: "3" });
    const r1 = await call("pay_invoice", { checkout_url: big.value.checkout_url });
    expect(r1).toMatchObject({ isError: true });
    expect(r1.text).toMatch(/per-payment limit of 1 MUSD/);

    const a = await call("create_invoice", { amount: "1" });
    expect((await call("pay_invoice", { checkout_url: a.value.checkout_url, max_amount: "0.5" })).text).toMatch(/more than the 0.5 MUSD/);
    expect((await call("pay_invoice", { checkout_url: a.value.checkout_url })).isError).toBe(false);
    const b = await call("create_invoice", { amount: "1" });
    expect((await call("pay_invoice", { checkout_url: b.value.checkout_url })).text).toMatch(/session limit of 1.5 MUSD/);
    expect(mezout.relayBodies).toHaveLength(1);
  });

  it("refuses to pay on any chain but Mezo testnet", async () => {
    const { call } = await connect({}, { chainId: 8453 });
    const inv = await call("create_invoice", { amount: "0.1" });
    const r = await call("pay_invoice", { checkout_url: inv.value.checkout_url });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/31611/);
  });

  it("pays an HTTP 402 Mezout paywall and returns the resource", async () => {
    const { call, mezout } = await connect();
    const r = await call("fetch_paid_resource", { url: "https://api.example.test/answer" });
    expect(r.value).toMatchObject({ status: 200, body: JSON.stringify({ answer: 42 }), payment: { amount: "0.05", settlement: { success: true } } });
    expect(mezout.relayBodies).toHaveLength(1);
  });

  it("never returns the payer key or signatures", async () => {
    const { call, mezout, payerKey } = await connect();
    const inv = await call("create_invoice", { amount: "0.1" });
    const outputs = [await call("pay_invoice", { checkout_url: inv.value.checkout_url }), await call("get_budget")].map((r) => r.text).join("\n");
    const relayed = mezout.relayBodies[0] as { payerSig: string; permit: { r: string; s: string } };
    expect(outputs).not.toContain(payerKey.slice(2));
    expect(outputs).not.toContain(relayed.payerSig.slice(2, 40));
    expect(outputs).not.toContain(relayed.permit.r.slice(2));
  });

  it("explains which env var a tool needs", async () => {
    const { call } = await connect({ apiKey: undefined, payerKey: undefined });
    expect((await call("create_invoice", { amount: "1" })).text).toMatch(/MEZOUT_API_KEY/);
    expect((await call("pay_invoice", { checkout_url: "https://x.test/pay/abc" })).text).toMatch(/MEZOUT_PAYER_PRIVATE_KEY/);
  });
});

describe("loadConfig", () => {
  it("has testnet defaults and conservative caps", () => {
    expect(loadConfig({})).toMatchObject({ apiUrl: "https://usemezout.vercel.app", maxPerPayment: "1", maxPerSession: "10" });
  });

  it("refuses other chains, live keys, plain http and bad caps without echoing the key", () => {
    expect(() => loadConfig({ MEZOUT_CHAIN_ID: "1" })).toThrow(/31611/);
    expect(() => loadConfig({ MEZOUT_API_KEY: "mzk_live_x" })).toThrow(/testnet/);
    expect(() => loadConfig({ MEZOUT_API_URL: "http://mezout.example" })).toThrow(/https/);
    expect(() => loadConfig({ MEZOUT_MAX_PAYMENT_MUSD: "5", MEZOUT_MAX_SESSION_MUSD: "1" })).toThrow(/at least/);
    try {
      loadConfig({ MEZOUT_PAYER_PRIVATE_KEY: "0xsecretvalue" });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).not.toContain("secretvalue");
    }
  });
});
