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
  webhookSigningSecret: () => required("WEBHOOK_SIGNING_SECRET"),
  cronSecret: () => required("CRON_SECRET"),
  // Absolute links in webhook payloads. Vercel sets VERCEL_PROJECT_PRODUCTION_URL to the production domain.
  appUrl: () =>
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
};
