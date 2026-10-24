import "server-only";
import { getAddress, isAddress, type Address, type Hex } from "viem";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

function address(name: string): Address {
  const v = required(name);
  if (!isAddress(v)) throw new Error(`${name} is not an address`);
  return getAddress(v);
}

export const serverEnv = {
  rpcUrl: () => process.env.MEZO_RPC_URL ?? "https://rpc.test.mezo.org",
  router: () => address("NEXT_PUBLIC_ROUTER_ADDRESS"),
  relayerKey: () => required("RELAYER_PRIVATE_KEY") as Hex,
  invoiceSignerKey: () => required("INVOICE_SIGNER_PRIVATE_KEY") as Hex,
};
