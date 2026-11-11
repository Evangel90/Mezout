import { isHex, parseUnits, type Hex } from "viem";

export type Config = {
  apiUrl: string;
  /** Merchant API key: enables create_invoice, get_invoice, list_invoices and refund. */
  apiKey?: string;
  /** Payer key: enables pay_invoice and fetch_paid_resource. Never logged or returned. */
  payerKey?: Hex;
  rpcUrl: string;
  maxPerPayment: string;
  maxPerSession: string;
};

const DECIMAL = /^\d+(\.\d{1,18})?$/;

function decimal(name: string, value: string): string {
  if (!DECIMAL.test(value)) throw new Error(`${name} must be a decimal MUSD amount, e.g. "1.00"`);
  return value;
}

/** Reads the server's settings from environment variables. Throws with a readable message on bad values. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const apiUrl = (env.MEZOUT_API_URL || "https://usemezout.vercel.app").replace(/\/+$/, "");
  const url = new URL(apiUrl);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("MEZOUT_API_URL must be https (http only for localhost)");
  }
  if (env.MEZOUT_CHAIN_ID && env.MEZOUT_CHAIN_ID !== "31611") {
    throw new Error("Mezout's MCP server runs on Mezo testnet (chain 31611) only");
  }
  const apiKey = env.MEZOUT_API_KEY || undefined;
  if (apiKey && !apiKey.startsWith("mzk_test_")) throw new Error("MEZOUT_API_KEY must be a testnet key (mzk_test_…)");

  const rawKey = env.MEZOUT_PAYER_PRIVATE_KEY || undefined;
  let payerKey: Hex | undefined;
  if (rawKey) {
    const k = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
    // Never echo the value, even when it is malformed.
    if (!isHex(k) || k.length !== 66) throw new Error("MEZOUT_PAYER_PRIVATE_KEY must be a 32-byte hex private key");
    payerKey = k;
  }

  const maxPerPayment = decimal("MEZOUT_MAX_PAYMENT_MUSD", env.MEZOUT_MAX_PAYMENT_MUSD || "1");
  const maxPerSession = decimal("MEZOUT_MAX_SESSION_MUSD", env.MEZOUT_MAX_SESSION_MUSD || "10");
  if (parseUnits(maxPerSession, 18) < parseUnits(maxPerPayment, 18)) {
    throw new Error("MEZOUT_MAX_SESSION_MUSD must be at least MEZOUT_MAX_PAYMENT_MUSD");
  }
  return {
    apiUrl,
    apiKey,
    payerKey,
    rpcUrl: env.MEZO_RPC_URL || "https://rpc.test.mezo.org",
    maxPerPayment,
    maxPerSession,
  };
}
