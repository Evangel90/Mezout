import "server-only";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { serverEnv } from "./env";
import { serverNetwork } from "./network";

// Next.js caches server-side fetch calls, POSTs included, and viem's JSON-RPC request ids restart at 1 with each
// process, so without no-store a restarted server is served months-old block numbers, logs, and nonces.
const rpc = () => http(serverEnv.rpcUrl(), { fetchOptions: { cache: "no-store" } });

export const publicClient = () => createPublicClient({ chain: serverNetwork().chain, transport: rpc() });

export const relayerClient = () =>
  createWalletClient({
    account: privateKeyToAccount(serverEnv.relayerKey()),
    chain: serverNetwork().chain,
    transport: rpc(),
  });

export const invoiceSigner = () => privateKeyToAccount(serverEnv.invoiceSignerKey());
