import { isHex, parseUnits, type Hex } from "viem";
import { resolveSettings, SETTING_KEYS, settingsPath, type Env, type ResolvedSettings } from "./settings";

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

export const DECIMAL = /^\d+(\.\d{1,18})?$/;

/** A testnet merchant key. */
export const isTestApiKey = (key: string) => /^mzk_test_[A-Za-z0-9_-]+$/.test(key);

/** `0x` + 64 hex digits (a missing `0x` is added), or null. Never put the input in a message. */
export function normalizePayerKey(raw: string): Hex | null {
  const k = raw.trim().startsWith("0x") ? raw.trim() : `0x${raw.trim()}`;
  return isHex(k) && k.length === 66 ? (k as Hex) : null;
}

function decimal(name: string, value: string): string {
  if (!DECIMAL.test(value)) throw new Error(`${name} must be a decimal MUSD amount, e.g. "1.00"`);
  return value;
}

/** Validates the server's settings, given by their environment variable names. Throws with a readable message on bad values. */
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

/**
 * Loads the settings the server runs with: environment variables first, then the file `init` saves
 * (`~/.mezout/mcp.json` or `MEZOUT_CONFIG`). Errors name the setting and where it came from, never its value.
 */
export function loadSettings(env: Env = process.env, path = settingsPath(env)): { config: Config; resolved: ResolvedSettings } {
  const resolved = resolveSettings(env, path);
  try {
    // MEZOUT_CHAIN_ID is read from the environment only; the file never sets it.
    return { config: loadConfig({ ...resolved.values, MEZOUT_CHAIN_ID: env.MEZOUT_CHAIN_ID }), resolved };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const key = SETTING_KEYS.find((k) => message.startsWith(k));
    throw new Error(key && resolved.sources[key] === "file" ? `${message} (in ${resolved.file.path})` : message);
  }
}
