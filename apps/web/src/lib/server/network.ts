import "server-only";
import { getAddress, isAddress, isAddressEqual, type Address } from "viem";
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
 * - on mainnet, NEXT_PUBLIC_ROUTER_ADDRESS must be the network's own MezoutRouter, never a testnet one;
 * - AGENT_WALLET_FACTORY_ADDRESS, when set, is allowed on this network (see agentWalletFactory).
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
  agentWalletFactory(config, env); // throws on an agent-wallet factory this network does not allow
  return config;
}

let checked: MezoNetworkConfig | undefined;

/** The deployment's network, checked once per process. Every server path that touches the chain goes through it. */
export function serverNetwork(): MezoNetworkConfig {
  checked ??= assertNetworkReady();
  return checked;
}

/**
 * The MezoutAgentWalletFactory whose wallets the relay may call, or undefined when agent-wallet payments are off.
 * AGENT_WALLET_FACTORY_ADDRESS can override the network book's factory on testnet. On mainnet
 * only the network book's verified factory is used, and an env value that differs from it is refused, as for the router.
 */
export function agentWalletFactory(config: MezoNetworkConfig = serverNetwork(), env: Env = process.env): Address | undefined {
  const book = config.addresses.mezoutAgentWalletFactory;
  const raw = env.AGENT_WALLET_FACTORY_ADDRESS;
  if (!raw) return book ? getAddress(book) : undefined;
  if (!isAddress(raw)) throw new Error(`AGENT_WALLET_FACTORY_ADDRESS is not an address: "${raw}"`);
  const fromEnv = getAddress(raw);
  if (book && !isAddressEqual(book, fromEnv)) {
    throw new Error(`AGENT_WALLET_FACTORY_ADDRESS must be the ${config.label} MezoutAgentWalletFactory ${getAddress(book)}, got ${fromEnv}`);
  }
  if (!book && config.network !== "testnet") {
    throw new Error(`No verified MezoutAgentWalletFactory on ${config.label}; unset AGENT_WALLET_FACTORY_ADDRESS`);
  }
  return fromEnv;
}
