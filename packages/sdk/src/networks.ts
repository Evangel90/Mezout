import { defineChain, getAddress, type Address, type Chain } from "viem";
import { mezoTestnet } from "./chains";
import { mezoTestnetAddresses, mezoutAccountFactoryV2 } from "./addresses";

/**
 * Which Mezo network Mezout runs against. Testnet is the default everywhere and is the developer sandbox; mainnet is
 * opt-in with MEZO_NETWORK=mainnet and refuses to start while any address it needs is unverified.
 */
export type MezoNetwork = "testnet" | "mainnet";
export const MEZO_NETWORKS: readonly MezoNetwork[] = ["testnet", "mainnet"];
export const DEFAULT_MEZO_NETWORK: MezoNetwork = "testnet";

/**
 * Mezo mainnet (31612). Chain id, explorer and RPC from the Mezo docs (mezo-org/documentation @ 8387e2fc,
 * developers/getting-started/configure-environment.md); the RPC is the first provider listed there and answered
 * eth_chainId = 31612 on 14 Nov 2026.
 */
export const mezoMainnet = defineChain({
  id: 31612,
  name: "Mezo",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://mezo-mainnet.boar.network"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.mezo.org" } },
});

/** Every contract Mezout reads or calls. `undefined` means not verified (or not deployed) on that network. */
export type MezoAddressBook = {
  musd: Address | undefined;
  borrowerOperations: Address | undefined;
  borrowerOperationsSignatures: Address | undefined;
  troveManager: Address | undefined;
  hintHelpers: Address | undefined;
  sortedTroves: Address | undefined;
  priceFeed: Address | undefined;
  btcToken: Address | undefined;
  mezoToken: Address | undefined;
  tigrisRouter: Address | undefined;
  tigrisPoolFactory: Address | undefined;
  tigrisMusdBtcPool: Address | undefined;
  entryPoint07: Address | undefined;
  /** The router new invoices are signed for. */
  mezoutRouter: Address | undefined;
  mezoutAccountFactory: Address | undefined;
  /** MezoutAccountFactoryV2 (passkey accounts with recovery). Optional: without it sign-up stays on v1. */
  mezoutAccountFactoryV2: Address | undefined;
};
export type MezoAddressKey = keyof MezoAddressBook;

export type MezoNetworkConfig = {
  network: MezoNetwork;
  chain: Chain;
  chainId: number;
  /** CAIP-2 id, as used by x402. */
  caip2: `eip155:${number}`;
  /** Shown to people: "Mezo testnet" or "Mezo mainnet". */
  label: string;
  explorerUrl: string;
  /** Sourcify repository for this chain (contract source verification). */
  sourcifyUrl: string;
  /** Testnet only. */
  faucetUrl: string | undefined;
  /** Mezo's own borrow app, linked from the loan manager. Undefined when not confirmed for the network. */
  borrowAppUrl: string | undefined;
  /** API keys for this network start with this; a key for the other network is always refused. */
  apiKeyPrefix: "mzk_test_" | "mzk_live_";
  addresses: MezoAddressBook;
  /** Routers from before `mezoutRouter` whose links and payments are still honoured. */
  legacyRouters: readonly Address[];
  /** Where each address came from and how it was checked on-chain. */
  sources: Partial<Record<MezoAddressKey, string>>;
};

const TESTNET_SOURCE = "docs/M0-findings.md: mezo-org/musd matsnet + mezo-org/tigris testnet deployments, checked on-chain 24 Oct 2026";

export const testnetConfig: MezoNetworkConfig = {
  network: "testnet",
  chain: mezoTestnet,
  chainId: mezoTestnet.id,
  caip2: `eip155:${mezoTestnet.id}`,
  label: "Mezo testnet",
  explorerUrl: mezoTestnet.blockExplorers.default.url,
  sourcifyUrl: `https://repo.sourcify.dev/${mezoTestnet.id}`,
  faucetUrl: "https://faucet.test.mezo.org",
  borrowAppUrl: "https://testnet.mezo.org/borrow",
  apiKeyPrefix: "mzk_test_",
  addresses: {
    musd: mezoTestnetAddresses.musd,
    borrowerOperations: mezoTestnetAddresses.borrowerOperations,
    borrowerOperationsSignatures: mezoTestnetAddresses.borrowerOperationsSignatures,
    troveManager: mezoTestnetAddresses.troveManager,
    hintHelpers: mezoTestnetAddresses.hintHelpers,
    sortedTroves: mezoTestnetAddresses.sortedTroves,
    priceFeed: mezoTestnetAddresses.priceFeed,
    btcToken: mezoTestnetAddresses.btcToken,
    mezoToken: mezoTestnetAddresses.mezoToken,
    tigrisRouter: mezoTestnetAddresses.tigrisRouter,
    tigrisPoolFactory: mezoTestnetAddresses.tigrisPoolFactory,
    tigrisMusdBtcPool: mezoTestnetAddresses.tigrisMusdBtcPool,
    entryPoint07: mezoTestnetAddresses.entryPoint07,
    mezoutRouter: mezoTestnetAddresses.mezoutRouterV3,
    mezoutAccountFactory: mezoTestnetAddresses.mezoutAccountFactory,
    mezoutAccountFactoryV2: mezoutAccountFactoryV2 ?? undefined,
  },
  legacyRouters: [mezoTestnetAddresses.mezoutRouterV1, mezoTestnetAddresses.mezoutRouterV2],
  sources: { musd: TESTNET_SOURCE },
};

const MUSD_REPO = "mezo-org/musd @ da7888a1 solidity/artifacts/deployments/mainnet";
const DOCS = "Mezo docs (mezo-org/documentation @ 8387e2fc) users/resources/contracts-reference.md";
const ONCHAIN = "checked read-only on chain 31612 at block 13,220,720 (14 Nov 2026) via two documented RPCs";

/**
 * Mezo mainnet. Every address is in an official Mezo source and was confirmed on-chain (code present plus the getters
 * named). Anything else is `undefined` on purpose: never fill one in without the same two checks.
 */
export const mainnetConfig: MezoNetworkConfig = {
  network: "mainnet",
  chain: mezoMainnet,
  chainId: mezoMainnet.id,
  caip2: `eip155:${mezoMainnet.id}`,
  label: "Mezo mainnet",
  explorerUrl: mezoMainnet.blockExplorers.default.url,
  sourcifyUrl: `https://repo.sourcify.dev/${mezoMainnet.id}`,
  faucetUrl: undefined,
  borrowAppUrl: undefined,
  apiKeyPrefix: "mzk_live_",
  addresses: {
    musd: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
    borrowerOperations: "0x44b1bac67dDA612a41a58AAf779143B181dEe031",
    borrowerOperationsSignatures: "0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a",
    troveManager: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193",
    hintHelpers: "0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3",
    sortedTroves: "0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f",
    priceFeed: "0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88",
    btcToken: "0x7b7C000000000000000000000000000000000000",
    mezoToken: "0x7B7c000000000000000000000000000000000001",
    tigrisRouter: "0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706",
    tigrisPoolFactory: "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248",
    tigrisMusdBtcPool: "0x52e604c44417233b6CcEDDDc0d640A405Caacefb",
    // Bytecode identical to the canonical v0.7 EntryPoint is deployed here, but no Mezo doc or repo lists it, so it
    // stays unverified until the owner confirms it.
    entryPoint07: undefined,
    // Not deployed yet: see contracts/script/DeployMainnet.s.sol and docs/MAINNET-CHECKLIST.md.
    mezoutRouter: undefined,
    mezoutAccountFactory: undefined,
    mezoutAccountFactoryV2: undefined,
  },
  legacyRouters: [],
  sources: {
    musd: `${DOCS} + ${MUSD_REPO}/MUSD.json; name()="Mezo USD", symbol()="MUSD", DOMAIN_SEPARATOR matches ("Mezo USD","1",31612); ${ONCHAIN}`,
    borrowerOperations: `${MUSD_REPO}/BorrowerOperations.json; musd(), troveManager(), priceFeed(), borrowerOperationsSignaturesAddress() all match; minNetDebt()=1800e18; ${ONCHAIN}`,
    borrowerOperationsSignatures: `${MUSD_REPO}/BorrowerOperationsSignatures.json; borrowerOperations() matches; eip712Domain()=("BorrowerOperationsSignatures","1",31612,self); ${ONCHAIN}`,
    troveManager: `${MUSD_REPO}/TroveManager.json; musdToken(), sortedTroves(), activePool() match; MUSD_GAS_COMPENSATION()=200e18; ${ONCHAIN}`,
    hintHelpers: `${MUSD_REPO}/HintHelpers.json; troveManager(), sortedTroves() match; ${ONCHAIN}`,
    sortedTroves: `${MUSD_REPO}/SortedTroves.json; troveManager() matches; ${ONCHAIN}`,
    priceFeed: `${MUSD_REPO}/PriceFeed.json; oracle()=0x7b7c…0015, fetchPrice() live; ${ONCHAIN}`,
    btcToken: `${DOCS} (BTC); name()/symbol()="BTC", 18 decimals, DOMAIN_SEPARATOR matches ("BTC","1",31612); ${ONCHAIN}`,
    mezoToken: `${DOCS} (MEZO token); name()/symbol()="MEZO", 18 decimals, DOMAIN_SEPARATOR matches ("MEZO","1",31612); ${ONCHAIN}`,
    tigrisRouter: `mezo-org/tigris @ 0a3b5e84 solidity/deployments/mainnet/Router.json; defaultFactory() = documented PoolFactory; ${ONCHAIN}`,
    tigrisPoolFactory: `${DOCS} (Pool Contracts) + mezo-org/tigris @ 0a3b5e84 PoolFactory.json; getPool(MUSD,BTC,false) = documented pool; ${ONCHAIN}`,
    tigrisMusdBtcPool: `${DOCS} (MUSD/BTC Pool); token0()=BTC, token1()=MUSD, stable()=false, factory() matches, fee 30 bps; ${ONCHAIN}`,
    entryPoint07: "UNVERIFIED: canonical v0.7 code hash 0x8db5…fc58 is present, but no Mezo source lists it",
    mezoutRouter: "NOT DEPLOYED on mainnet",
    mezoutAccountFactory: "NOT DEPLOYED on mainnet",
    mezoutAccountFactoryV2: "NOT DEPLOYED on mainnet",
  },
};

const CONFIGS: Record<MezoNetwork, MezoNetworkConfig> = { testnet: testnetConfig, mainnet: mainnetConfig };

/** Parses MEZO_NETWORK. Unset or empty means testnet; anything other than testnet or mainnet is an error. */
export function parseMezoNetwork(value: string | undefined | null): MezoNetwork {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "") return DEFAULT_MEZO_NETWORK;
  if (v === "testnet" || v === "mainnet") return v;
  throw new Error(`MEZO_NETWORK must be "testnet" or "mainnet", got "${value}"`);
}

export const getNetworkConfig = (network: MezoNetwork = DEFAULT_MEZO_NETWORK): MezoNetworkConfig => CONFIGS[network];

/** The network for a chain id, or undefined for a chain Mezout does not run on. */
export function networkForChainId(chainId: number): MezoNetwork | undefined {
  return MEZO_NETWORKS.find((n) => CONFIGS[n].chainId === chainId);
}

/** Config for a chain id; an unknown or missing id means testnet, as before networks existed. */
export function configForChainId(chainId: number | undefined): MezoNetworkConfig {
  if (chainId === undefined) return testnetConfig;
  const network = networkForChainId(chainId);
  if (!network) throw new Error(`Chain ${chainId} is not a Mezo network Mezout supports`);
  return CONFIGS[network];
}

export class MissingAddressError extends Error {
  constructor(
    readonly network: MezoNetwork,
    readonly missing: MezoAddressKey[],
  ) {
    super(
      `Mezout cannot run on Mezo ${network}: no verified address for ${missing.join(", ")}. ` +
        "Add each one to packages/sdk/src/networks.ts only after confirming it in Mezo's docs or GitHub and on-chain.",
    );
    this.name = "MissingAddressError";
  }
}

/** The address, or a MissingAddressError naming it. */
export function requireAddress(config: MezoNetworkConfig, key: MezoAddressKey): Address {
  const value = config.addresses[key];
  if (!value) throw new MissingAddressError(config.network, [key]);
  return getAddress(value);
}

/** Checks every key at once so the error lists everything still missing, not just the first. */
export function requireAddresses<K extends MezoAddressKey>(config: MezoNetworkConfig, keys: readonly K[]): Record<K, Address> {
  const missing = keys.filter((k) => !config.addresses[k]);
  if (missing.length > 0) throw new MissingAddressError(config.network, missing);
  return Object.fromEntries(keys.map((k) => [k, getAddress(config.addresses[k] as Address)])) as Record<K, Address>;
}

/** What the hosted app (checkout, relayer, indexer, API, passkey withdrawals) needs before it may start. */
export const APP_REQUIRED_ADDRESSES = [
  "musd",
  "borrowerOperations",
  "borrowerOperationsSignatures",
  "troveManager",
  "hintHelpers",
  "sortedTroves",
  "priceFeed",
  "btcToken",
  "mezoToken",
  "tigrisPoolFactory",
  "entryPoint07",
  "mezoutRouter",
  "mezoutAccountFactory",
] as const satisfies readonly MezoAddressKey[];

/** Every MezoutRouter whose signatures this network honours: the current one plus legacy ones. */
export function knownRoutersFor(config: MezoNetworkConfig): Address[] {
  return [...config.legacyRouters, ...(config.addresses.mezoutRouter ? [config.addresses.mezoutRouter] : [])];
}

/** The network an API key belongs to, from its prefix, or undefined if it is not a Mezout key. */
export function apiKeyNetwork(key: string): MezoNetwork | undefined {
  return MEZO_NETWORKS.find((n) => key.startsWith(CONFIGS[n].apiKeyPrefix));
}
