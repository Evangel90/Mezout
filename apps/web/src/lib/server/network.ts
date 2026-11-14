import "server-only";
import { getAddress, isAddress, isAddressEqual } from "viem";
import {
  APP_REQUIRED_ADDRESSES,
  getNetworkConfig,
  parseMezoNetwork,
  requireAddresses,
  type MezoNetwork,
  type MezoNetworkConfig,
} from "@mezout/sdk";
import { mezoNetwork } from "../network";

type Env = Record<string, string | undefined>;

/**
 * Checks that this deployment can run on its network, and throws an error naming everything wrong if not:
 * - MEZO_NETWORK at runtime must match the network the app was built for;
 * - every contract the app uses has a verified address on that network;
 * - on mainnet, NEXT_PUBLIC_ROUTER_ADDRESS must be the network's own MezoutRouter, never a testnet one.
 */
export function assertNetworkReady(built: MezoNetwork = mezoNetwork, env: Env = process.env): MezoNetworkConfig {
  const runtime = parseMezoNetwork(env.MEZO_NETWORK ?? built);
  if (runtime !== built) {
    throw new Error(`MEZO_NETWORK is "${runtime}" but this build is for "${built}". Rebuild with the same MEZO_NETWORK.`);
  }
  const config = getNetworkConfig(built);
  const resolved = requireAddresses(config, APP_REQUIRED_ADDRESSES);
  if (config.network !== "testnet") {
    const router = env.NEXT_PUBLIC_ROUTER_ADDRESS;
    if (!router || !isAddress(router) || !isAddressEqual(getAddress(router), resolved.mezoutRouter)) {
      throw new Error(
        `NEXT_PUBLIC_ROUTER_ADDRESS must be the ${config.label} MezoutRouter ${resolved.mezoutRouter}, got "${router ?? ""}"`,
      );
    }
  }
  return config;
}

let checked: MezoNetworkConfig | undefined;

/** The deployment's network, checked once per process. Every server path that touches the chain goes through it. */
export function serverNetwork(): MezoNetworkConfig {
  checked ??= assertNetworkReady();
  return checked;
}
