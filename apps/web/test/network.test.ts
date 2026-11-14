import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress, verifyMessage, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { MissingAddressError, keyRequestMessage, mainnetConfig, mezoTestnetAddresses, testnetConfig, type MezoNetwork } from "@mezout/sdk";
import type { Db } from "@/lib/server/db/client";
import { authenticate, issueApiKey } from "@/lib/server/apiKeys";
import { agentWalletFactory, assertNetworkReady } from "@/lib/server/network";
import { unauthorizedMessage } from "@/lib/server/v1";
import { mezoNetwork, network } from "@/lib/network";
import { testDb } from "./db";

const verify = (args: { address: Hex; message: string; signature: Hex }) => verifyMessage(args);
const now = Date.parse("2026-11-14T12:00:00.000Z");
const issuedAt = new Date(now).toISOString();

async function signedRequest(account: ReturnType<typeof privateKeyToAccount>, signedFor: MezoNetwork) {
  const signature = await account.signMessage({ message: keyRequestMessage(account.address, issuedAt, signedFor) });
  return { address: account.address, issuedAt, signature };
}

describe("network selection", () => {
  it("defaults to testnet", () => {
    expect(mezoNetwork).toBe("testnet");
    expect(network.chainId).toBe(31611);
    expect(assertNetworkReady("testnet", {}).network).toBe("testnet");
  });

  it("refuses to start on mainnet while any address is unverified, naming each one", () => {
    let error: unknown;
    try {
      assertNetworkReady("mainnet", { MEZO_NETWORK: "mainnet", NEXT_PUBLIC_ROUTER_ADDRESS: mezoTestnetAddresses.mezoutRouterV3 });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MissingAddressError);
    expect((error as MissingAddressError).missing).toEqual(["entryPoint07", "mezoutRouter", "mezoutAccountFactory"]);
  });

  it("refuses a runtime MEZO_NETWORK that differs from the build", () => {
    expect(() => assertNetworkReady("testnet", { MEZO_NETWORK: "mainnet" })).toThrow(/build is for "testnet"/);
    expect(() => assertNetworkReady("testnet", { MEZO_NETWORK: "mainet" })).toThrow(/must be "testnet" or "mainnet"/);
  });
});

describe("agent wallet factory", () => {
  const factory = getAddress("0x00000000000000000000000000000000000000bb");
  it("is off unless configured, and taken from AGENT_WALLET_FACTORY_ADDRESS on testnet", () => {
    expect(testnetConfig.addresses.mezoutAgentWalletFactory).toBeUndefined();
    expect(agentWalletFactory(testnetConfig, {})).toBeUndefined();
    expect(agentWalletFactory(testnetConfig, { AGENT_WALLET_FACTORY_ADDRESS: factory.toLowerCase() })).toBe(factory);
    expect(() => agentWalletFactory(testnetConfig, { AGENT_WALLET_FACTORY_ADDRESS: "0x123" })).toThrow(/not an address/);
  });

  it("is never taken from the environment on mainnet without a verified entry", () => {
    expect(mainnetConfig.addresses.mezoutAgentWalletFactory).toBeUndefined();
    expect(agentWalletFactory(mainnetConfig, {})).toBeUndefined();
    expect(() => agentWalletFactory(mainnetConfig, { AGENT_WALLET_FACTORY_ADDRESS: factory })).toThrow(/No verified MezoutAgentWalletFactory/);
    const verified = { ...mainnetConfig, addresses: { ...mainnetConfig.addresses, mezoutAgentWalletFactory: factory } } as typeof mainnetConfig;
    expect(agentWalletFactory(verified, {})).toBe(factory);
    expect(() => agentWalletFactory(verified, { AGENT_WALLET_FACTORY_ADDRESS: mezoTestnetAddresses.mezoutRouterV3 })).toThrow(/must be the Mezo mainnet/);
  });

  it("is checked at startup", () => {
    expect(() => assertNetworkReady("testnet", { AGENT_WALLET_FACTORY_ADDRESS: "nope" })).toThrow(/not an address/);
  });
});

describe("mainnet router check", () => {
  // Pretend every mainnet address is verified, to reach the router check that runs after the address check.
  const deployed = "0x00000000000000000000000000000000000000aa";
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@mezout/sdk", async (importOriginal) => {
      const sdk = await importOriginal<typeof import("@mezout/sdk")>();
      const full = { ...sdk.mainnetConfig, addresses: { ...sdk.mainnetConfig.addresses, entryPoint07: deployed, mezoutRouter: deployed, mezoutAccountFactory: deployed } };
      return { ...sdk, getNetworkConfig: (n: MezoNetwork) => (n === "mainnet" ? full : sdk.getNetworkConfig(n)) };
    });
  });

  it("never lets mainnet point at a testnet router", async () => {
    const { assertNetworkReady: check } = await import("@/lib/server/network");
    expect(() => check("mainnet", { NEXT_PUBLIC_ROUTER_ADDRESS: mezoTestnetAddresses.mezoutRouterV3 })).toThrow(
      /must be the Mezo mainnet MezoutRouter/,
    );
    expect(() => check("mainnet", {})).toThrow(/NEXT_PUBLIC_ROUTER_ADDRESS/);
    expect(check("mainnet", { NEXT_PUBLIC_ROUTER_ADDRESS: deployed }).network).toBe("mainnet");
    vi.doUnmock("@mezout/sdk");
  });
});

describe("API keys carry their network", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("issues mzk_test_ keys on testnet and mzk_live_ keys on mainnet", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const test = await issueApiKey(db, await signedRequest(account, "testnet"), verify, now);
    expect(test.key).toMatch(/^mzk_test_/);
    expect(test.merchant.network).toBe("testnet");

    const live = await issueApiKey(db, await signedRequest(account, "mainnet"), verify, now, "mainnet");
    expect(live.key).toMatch(/^mzk_live_/);
    expect(live.merchant.network).toBe("mainnet");
    // Same payout address, separate merchants per network.
    expect(live.merchant.id).not.toBe(test.merchant.id);
    const rows = await db.query.apiKeys.findMany();
    expect(rows.map((r) => r.network).sort()).toEqual(["mainnet", "testnet"]);
  });

  it("never authenticates a test key on mainnet, or a live key on testnet", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const test = await issueApiKey(db, await signedRequest(account, "testnet"), verify, now);
    const live = await issueApiKey(db, await signedRequest(account, "mainnet"), verify, now, "mainnet");

    expect((await authenticate(db, `Bearer ${test.key}`))?.id).toBe(test.merchant.id);
    expect(await authenticate(db, `Bearer ${test.key}`, "mainnet")).toBeNull();
    expect((await authenticate(db, `Bearer ${live.key}`, "mainnet"))?.id).toBe(live.merchant.id);
    expect(await authenticate(db, `Bearer ${live.key}`, "testnet")).toBeNull();
    // Relabelling a test key's prefix does not make it a live key.
    expect(await authenticate(db, `Bearer ${test.key.replace("mzk_test_", "mzk_live_")}`, "mainnet")).toBeNull();
  });

  it("refuses a testnet signature for a mainnet key", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    await expect(issueApiKey(db, await signedRequest(account, "testnet"), verify, now, "mainnet")).rejects.toThrow(
      /signature does not match/,
    );
  });

  it("explains a wrong-network key", () => {
    expect(unauthorizedMessage("Bearer mzk_test_abc", "mainnet")).toMatch(/Mezo testnet API key.*accepts only mzk_live_/);
    expect(unauthorizedMessage(null)).toBe("Missing or invalid API key. Send Authorization: Bearer mzk_test_…");
    expect(mainnetConfig.apiKeyPrefix).toBe("mzk_live_");
  });
});
