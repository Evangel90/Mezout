import "server-only";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mezoTestnet } from "@mezout/sdk";
import { serverEnv } from "./env";

export const publicClient = () => createPublicClient({ chain: mezoTestnet, transport: http(serverEnv.rpcUrl()) });

export const relayerClient = () =>
  createWalletClient({
    account: privateKeyToAccount(serverEnv.relayerKey()),
    chain: mezoTestnet,
    transport: http(serverEnv.rpcUrl()),
  });

export const invoiceSigner = () => privateKeyToAccount(serverEnv.invoiceSignerKey());
