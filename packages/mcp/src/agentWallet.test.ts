import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { getAddress, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { API_KEY, APP, FakeMezout, type FakeAgentWallet } from "@mezout/paywall/testing";
import { loadConfig, type Config } from "./config";
import { createMezoutServer } from "./server";

const WALLET = getAddress("0x00000000000000000000000000000000000a6e07");

/** The MCP server in agent-wallet mode: MEZOUT_PAYER_PRIVATE_KEY is a session key on WALLET. */
async function connect(wallet: Partial<FakeAgentWallet> = {}, config: Partial<Config> = {}) {
  const mezout = new FakeMezout();
  const sessionKey = generatePrivateKey();
  const agent = privateKeyToAccount(sessionKey).address;
  mezout.agentWallet = {
    address: WALLET,
    agent,
    maxPerPayment: parseUnits("1", 18),
    maxPerDay: parseUnits("3", 18),
    remainingToday: parseUnits("3", 18),
    validUntil: BigInt(Math.floor(Date.now() / 1000) + 3600),
    ...wallet,
  };
  const server = createMezoutServer(
    {
      apiUrl: APP,
      apiKey: API_KEY,
      payerKey: sessionKey,
      agentWallet: WALLET,
      rpcUrl: "http://unused",
      maxPerPayment: "1",
      maxPerSession: "2",
      ...config,
    },
    { fetch: mezout.fetch, chain: mezout.chain() },
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
    const text = res.content[0].text;
    let value: Record<string, any> = {};
    try {
      value = JSON.parse(text);
    } catch {
      /* plain-text error */
    }
    return { isError: !!res.isError, value, text };
  };
  return { call, mezout, agent, sessionKey };
}

describe("MCP pay_invoice from an agent wallet", () => {
  it("pays from the wallet with the session key, and get_budget says so", async () => {
    const { call, mezout, agent, sessionKey } = await connect();
    const inv = await call("create_invoice", { amount: "0.25" });
    const paid = await call("pay_invoice", { checkout_url: inv.value.checkout_url });
    expect(paid.isError).toBe(false);
    expect(paid.value).toMatchObject({ status: "paid", payer: WALLET, amount: "0.25" });
    expect(mezout.relayBodies[0]).toMatchObject({ method: "AGENT_WALLET", wallet: WALLET, agent });
    expect((await call("verify_payment", { invoice: inv.value.id })).value).toMatchObject({ isValid: true, payer: WALLET });

    const budget = await call("get_budget");
    expect(budget.value).toMatchObject({ payer: WALLET, mode: "agent_wallet", session_key: agent, spent: "0.25" });
    const relayed = mezout.relayBodies[0] as { agentSig: string };
    const outputs = `${paid.text}\n${budget.text}`;
    expect(outputs).not.toContain(sessionKey.slice(2));
    expect(outputs).not.toContain(relayed.agentSig.slice(2, 40));
  });

  it("refuses a revoked session key with a clear message and relays nothing", async () => {
    const { call, mezout } = await connect({ validUntil: 0n });
    const inv = await call("create_invoice", { amount: "0.25" });
    const r = await call("pay_invoice", { checkout_url: inv.value.checkout_url });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/not approved on the agent wallet/);
    expect(mezout.relayBodies).toHaveLength(0);
  });

  it("refuses past the wallet's on-chain daily limit even within the local caps", async () => {
    const { call, mezout } = await connect({ remainingToday: parseUnits("0.1", 18) });
    const inv = await call("create_invoice", { amount: "0.25" });
    const r = await call("pay_invoice", { checkout_url: inv.value.checkout_url });
    expect(r.text).toMatch(/allows today \(0.1 MUSD left\)/);
    expect(mezout.relayBodies).toHaveLength(0);
  });
});

describe("loadConfig: MEZOUT_AGENT_WALLET", () => {
  const key = generatePrivateKey();

  it("is off by default: the raw-key mode stays the default", () => {
    expect(loadConfig({ MEZOUT_PAYER_PRIVATE_KEY: key }).agentWallet).toBeUndefined();
  });

  it("takes a checksummed or lowercase address and needs the session key", () => {
    expect(loadConfig({ MEZOUT_PAYER_PRIVATE_KEY: key, MEZOUT_AGENT_WALLET: WALLET.toLowerCase() }).agentWallet).toBe(WALLET);
    expect(() => loadConfig({ MEZOUT_AGENT_WALLET: WALLET })).toThrow(/needs MEZOUT_PAYER_PRIVATE_KEY/);
    expect(() => loadConfig({ MEZOUT_PAYER_PRIVATE_KEY: key, MEZOUT_AGENT_WALLET: "0x1234" })).toThrow(/0x address/);
  });
});
