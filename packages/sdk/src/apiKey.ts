import { getAddress, type Address } from "viem";
import { getNetworkConfig, type MezoNetwork } from "./networks";

/** The network line of every signed Mezout message. Testnet keeps the original wording. */
export const networkLine = (network: MezoNetwork = "testnet") => {
  const c = getNetworkConfig(network);
  return `Network: ${c.label} (${c.chainId})`;
};

/** The exact text a merchant signs to get an API key. The server rebuilds it, so the client cannot change the wording. */
export function keyRequestMessage(address: Address, issuedAt: string, network: MezoNetwork = "testnet"): string {
  return [
    "Mezout: create an API key",
    `Payout address: ${getAddress(address)}`,
    `Issued at: ${issuedAt}`,
    networkLine(network),
  ].join("\n");
}

/** The exact text a merchant signs to sign in to the dashboard. Signing costs no gas. */
export function signInMessage(address: Address, issuedAt: string, network: MezoNetwork = "testnet"): string {
  return [
    "Mezout: sign in to the dashboard",
    `Payout address: ${getAddress(address)}`,
    `Issued at: ${issuedAt}`,
    networkLine(network),
  ].join("\n");
}
