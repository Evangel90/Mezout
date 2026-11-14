import { getNetworkConfig, parseMezoNetwork, type MezoNetworkConfig } from "@mezout/sdk";

// next.config.mjs copies MEZO_NETWORK into NEXT_PUBLIC_MEZO_NETWORK at build time, so the browser and the server
// agree. Unset means testnet.
export const mezoNetwork = parseMezoNetwork(process.env.NEXT_PUBLIC_MEZO_NETWORK);

/** The Mezo network this deployment runs on: chain, explorer, labels and verified addresses. */
export const network: MezoNetworkConfig = getNetworkConfig(mezoNetwork);

/** Mezo and Mezout contracts on this network. Unverified ones are undefined; the server refuses to start without them. */
const book = network.addresses;
const pick = (key: keyof typeof book) => book[key] ?? "0x0000000000000000000000000000000000000000";

/**
 * Addresses for browser code. The server's startup check (lib/server/network.ts) guarantees none of these is missing
 * before a page is served; the zero-address fallback only keeps types simple and is never used for a live call.
 */
export const addresses = {
  musd: pick("musd"),
  borrowerOperations: pick("borrowerOperations"),
  borrowerOperationsSignatures: pick("borrowerOperationsSignatures"),
  btcToken: pick("btcToken"),
  mezoToken: pick("mezoToken"),
  mezoutAccountFactory: pick("mezoutAccountFactory"),
} as const;

export const explorerAddressUrl = (address: string) => `${network.explorerUrl}/address/${address}`;
