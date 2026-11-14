import { describe, expect, it } from "vitest";
import { createPublicClient, custom, domainSeparator, getAddress, isAddress } from "viem";
import {
  APP_REQUIRED_ADDRESSES,
  MissingAddressError,
  apiKeyNetwork,
  configForChainId,
  getNetworkConfig,
  knownRoutersFor,
  mainnetConfig,
  mezoMainnet,
  parseMezoNetwork,
  requireAddress,
  requireAddresses,
  testnetConfig,
} from "./networks";
import { borrowerOperationsSignaturesDomain, btcDomain, mezoDomain, musdDomain } from "./typedData";
import { keyRequestMessage, signInMessage } from "./apiKey";
import { linkRouter } from "./link";
import { decodeMusdWithdrawal, encodeMusdWithdrawal } from "./account";
import { getTroveSnapshot } from "./trove";
import { knownMezoutRouters, mezoTestnetAddresses } from "./addresses";

const someone = "0x1111111111111111111111111111111111111111";

describe("network selection", () => {
  it("defaults to testnet", () => {
    expect(parseMezoNetwork(undefined)).toBe("testnet");
    expect(parseMezoNetwork("")).toBe("testnet");
    expect(getNetworkConfig()).toBe(testnetConfig);
    expect(parseMezoNetwork(" Mainnet ")).toBe("mainnet");
  });

  it("refuses an unknown network instead of guessing", () => {
    expect(() => parseMezoNetwork("main")).toThrow(/testnet" or "mainnet/);
    expect(() => configForChainId(1)).toThrow(/not a Mezo network/);
  });

  it("keeps testnet exactly as before", () => {
    expect(testnetConfig.chainId).toBe(31611);
    expect(testnetConfig.caip2).toBe("eip155:31611");
    expect(testnetConfig.apiKeyPrefix).toBe("mzk_test_");
    expect(testnetConfig.explorerUrl).toBe("https://explorer.test.mezo.org");
    expect(() => requireAddresses(testnetConfig, APP_REQUIRED_ADDRESSES)).not.toThrow();
    expect(new Set(knownRoutersFor(testnetConfig))).toEqual(new Set(knownMezoutRouters));
  });

  it("describes mainnet from Mezo's docs", () => {
    expect(mainnetConfig.chainId).toBe(31612);
    expect(mezoMainnet.id).toBe(31612);
    expect(mainnetConfig.caip2).toBe("eip155:31612");
    expect(mainnetConfig.explorerUrl).toBe("https://explorer.mezo.org");
    expect(mainnetConfig.apiKeyPrefix).toBe("mzk_live_");
    expect(mainnetConfig.faucetUrl).toBeUndefined();
    expect(mainnetConfig.chain.testnet).toBeFalsy();
  });

  it("records a source for every mainnet address it sets, and only checksummed addresses", () => {
    for (const [key, value] of Object.entries(mainnetConfig.addresses)) {
      if (value === undefined) continue;
      expect(isAddress(value) && getAddress(value) === value, key).toBe(true);
      expect(mainnetConfig.sources[key as keyof typeof mainnetConfig.sources], key).toMatch(/checked read-only on chain 31612/);
    }
  });
});

describe("mainnet refuses what is not verified", () => {
  it("names every missing address at once", () => {
    try {
      requireAddresses(mainnetConfig, APP_REQUIRED_ADDRESSES);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MissingAddressError);
      expect((e as MissingAddressError).missing).toEqual(["entryPoint07", "mezoutRouter", "mezoutAccountFactory"]);
      expect((e as Error).message).toMatch(/cannot run on Mezo mainnet/);
    }
  });

  it("has no router to honour yet", () => {
    expect(() => requireAddress(mainnetConfig, "mezoutRouter")).toThrow(MissingAddressError);
    expect(knownRoutersFor(mainnetConfig)).toEqual([]);
  });

  it("never accepts a router-less (testnet-era) link on mainnet", () => {
    const signed = { invoice: { merchant: someone, amount: 1n, fee: 0n, orderId: `0x${"00".repeat(32)}`, expiry: 1n }, signature: "0x01" } as const;
    expect(linkRouter(signed)).toBe(mezoTestnetAddresses.mezoutRouterV1);
    expect(() => linkRouter(signed, "mainnet")).toThrow(/no router/);
  });
});

describe("API keys and signed messages carry their network", () => {
  it("tells test and live keys apart", () => {
    expect(apiKeyNetwork("mzk_test_abc")).toBe("testnet");
    expect(apiKeyNetwork("mzk_live_abc")).toBe("mainnet");
    expect(apiKeyNetwork("sk_live_abc")).toBeUndefined();
  });

  it("keeps the testnet wording and names mainnet explicitly", () => {
    const at = "2026-11-14T00:00:00.000Z";
    expect(keyRequestMessage(someone, at)).toContain("Network: Mezo testnet (31611)");
    expect(signInMessage(someone, at, "mainnet")).toContain("Network: Mezo mainnet (31612)");
    expect(keyRequestMessage(someone, at, "mainnet")).not.toBe(keyRequestMessage(someone, at));
  });
});

describe("mainnet EIP-712 domains", () => {
  // DOMAIN_SEPARATOR() and eip712Domain() read from chain 31612 on 14 Nov 2026.
  it("match the separators on-chain", () => {
    expect(domainSeparator({ domain: musdDomain(31612) })).toBe("0x0a43819914359cf08d7ef52ccb53aadf5478d3d2fc676003ccb84491d09a3e93");
    expect(domainSeparator({ domain: btcDomain(31612) })).toBe("0xf98315225d67e6d98b18f0a6b73bf711423ff8310bd350400db36e876c5cddf4");
    expect(domainSeparator({ domain: mezoDomain(31612) })).toBe("0x43d4db585ef58130660466546b06e8802f4479372409cf0636169cfd80f6a186");
    expect(borrowerOperationsSignaturesDomain(31612).verifyingContract).toBe("0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a");
  });

  it("still default to testnet", () => {
    expect(musdDomain().verifyingContract).toBe(mezoTestnetAddresses.musd);
    expect(musdDomain().chainId).toBe(31611);
  });
});

describe("network-aware helpers", () => {
  it("encodes withdrawals of the network's MUSD", () => {
    const data = encodeMusdWithdrawal(someone, 5n, "mainnet");
    expect(decodeMusdWithdrawal(data, "mainnet")).toEqual({ to: someone, amount: 5n });
    // A mainnet withdrawal is not a testnet one and vice versa.
    expect(decodeMusdWithdrawal(data)).toBeNull();
    expect(decodeMusdWithdrawal(encodeMusdWithdrawal(someone, 5n), "mainnet")).toBeNull();
  });

  it("reads troves from the client's chain", async () => {
    const seen: string[] = [];
    const transport = custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        if (method === "eth_call") {
          seen.push(getAddress((params as [{ to: string }])[0].to));
          throw new Error("stop");
        }
        throw new Error(`unexpected ${method}`);
      },
    }, { retryCount: 0 });
    const client = createPublicClient({ chain: mezoMainnet, transport });
    await expect(getTroveSnapshot(client, someone)).rejects.toThrow();
    expect(seen).toContain(mainnetConfig.addresses.troveManager);
    expect(seen).not.toContain(mezoTestnetAddresses.troveManager);
  });
});

describe("optional Mezout contracts (recovery factory, agent wallet factory)", () => {
  it("are testnet entries from addresses.ts, never required to start, and undefined on mainnet", async () => {
    const { mezoutAccountFactoryV2, mezoutAgentWalletFactory } = await import("./addresses");
    expect(testnetConfig.addresses.mezoutAccountFactoryV2).toBe(mezoutAccountFactoryV2 ?? undefined);
    expect(testnetConfig.addresses.mezoutAgentWalletFactory).toBe(mezoutAgentWalletFactory ?? undefined);
    expect(mainnetConfig.addresses.mezoutAccountFactoryV2).toBeUndefined();
    expect(mainnetConfig.addresses.mezoutAgentWalletFactory).toBeUndefined();
    expect(APP_REQUIRED_ADDRESSES).not.toContain("mezoutAccountFactoryV2");
    expect(APP_REQUIRED_ADDRESSES).not.toContain("mezoutAgentWalletFactory");
  });
});
