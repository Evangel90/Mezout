import { describe, expect, it } from "vitest";
import { getAddress, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mezoTestnetAddresses } from "@mezout/sdk";
import { createMusdPayer, fetchWithPayment } from "./client";
import { withMezout402 } from "./next";
import { API_KEY, APP, FakeMezout, MERCHANT, type FakeAgentWallet } from "./test-fakes";

const WALLET = getAddress("0x00000000000000000000000000000000000a6e07");
const URL_ = "https://api.shop.test/report";

/** A paywalled merchant API and a payer that pays from an agent wallet with a session key. */
function setup(wallet: Partial<FakeAgentWallet> = {}, price = "0.05") {
  const mezout = new FakeMezout();
  const handler = withMezout402({ apiKey: API_KEY, apiUrl: APP, price, fetch: mezout.fetch }, async (_req, _ctx, payment) =>
    Response.json({ paidBy: payment.payer }),
  );
  const merchantFetch = (async (input: string | URL | Request, init?: RequestInit) =>
    handler(new Request(input as string, init), {})) as typeof fetch;
  const account = privateKeyToAccount(generatePrivateKey());
  mezout.agentWallet = {
    address: WALLET,
    agent: account.address,
    maxPerPayment: parseUnits("1", 18),
    maxPerDay: parseUnits("5", 18),
    remainingToday: parseUnits("5", 18),
    validUntil: BigInt(Math.floor(Date.now() / 1000) + 3600),
    ...wallet,
  };
  const payer = createMusdPayer({
    account,
    agentWallet: WALLET,
    appUrl: APP,
    maxPerPayment: "1",
    maxPerSession: "2",
    chain: mezout.chain(),
    fetch: mezout.fetch,
  });
  const pay = () => fetchWithPayment(URL_, { payer, fetch: merchantFetch });
  return { mezout, payer, account, pay };
}

describe("payer from an agent wallet (session key)", () => {
  it("pays from the wallet: the session key signs the router's Payment for the wallet, with no permit", async () => {
    const { payer, mezout, account, pay } = setup();
    expect(payer.address).toBe(WALLET);
    expect(payer.sessionKey).toBe(account.address);
    const { response, payment } = await pay();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paidBy: WALLET });
    expect(payment).toMatchObject({ payer: WALLET, amount: "0.05" });
    const body = mezout.relayBodies[0] as Record<string, unknown>;
    expect(body).toMatchObject({ method: "AGENT_WALLET", wallet: WALLET, agent: account.address });
    expect(body).not.toHaveProperty("permit");
    expect(JSON.stringify(payment)).not.toContain(String(body.agentSig).slice(2, 40));
  });

  it("refuses before signing when the key is revoked or expired", async () => {
    const revoked = setup({ validUntil: 0n });
    await expect(revoked.pay()).rejects.toThrow(/not approved/);
    expect(revoked.mezout.relayBodies).toHaveLength(0);

    const expired = setup({ validUntil: BigInt(Math.floor(Date.now() / 1000) - 1) });
    await expect(expired.pay()).rejects.toThrow(/expired/);
    expect(expired.mezout.relayBodies).toHaveLength(0);
  });

  it("refuses over the wallet's on-chain per-payment and daily limits, and releases the reservation", async () => {
    const perPayment = setup({ maxPerPayment: parseUnits("0.01", 18) });
    await expect(perPayment.pay()).rejects.toThrow(/agent wallet's per-payment limit of 0.01 MUSD/);
    const daily = setup({ remainingToday: parseUnits("0.04", 18) });
    await expect(daily.pay()).rejects.toThrow(/0.04 MUSD left/);
    expect(perPayment.mezout.relayBodies.length + daily.mezout.relayBodies.length).toBe(0);
    expect(daily.payer.budget().remaining).toBe("2");
  });

  it("refuses merchants outside the owner's allow-list", async () => {
    const { mezout, pay } = setup({ merchants: [getAddress("0x0000000000000000000000000000000000000001")] });
    await expect(pay()).rejects.toThrow(/not allowed this merchant/);
    mezout.agentWallet!.merchants = [getAddress(MERCHANT)];
    expect((await pay()).response.status).toBe(200);
  });

  it("refuses links for a router the wallet does not pay through", async () => {
    const { mezout, pay } = setup({ router: mezoTestnetAddresses.mezoutRouterV2 });
    await expect(pay()).rejects.toThrow(/different Mezout router/);
    expect(mezout.relayBodies).toHaveLength(0);
  });

  it("still applies the client-side session cap on top of the wallet's limits", async () => {
    const { pay } = setup({}, "0.8");
    await pay();
    await pay();
    await expect(pay()).rejects.toThrow(/session limit/);
  });
});
