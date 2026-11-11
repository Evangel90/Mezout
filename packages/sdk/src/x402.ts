/**
 * x402 v2 wire format (x402-foundation/x402, specs/x402-specification-v2.md and transports-v2/http.md), with a
 * Mezout scheme. x402's `exact` EVM scheme moves tokens straight to `payTo` with EIP-3009 or Permit2; Mezout payments
 * must go through the MezoutRouter against a platform-signed invoice, so Mezout advertises its own scheme, `mezout`,
 * in the same envelope. The client pays the invoice first (gasless, through Mezout's relay) and sends the transaction
 * as proof; the server checks it with `POST /v1/verify`.
 */
import { mezoTestnet } from "./chains";

export const X402_VERSION = 2;
export const MEZOUT_SCHEME = "mezout";
/** CAIP-2 id of Mezo testnet. */
export const MEZO_TESTNET_NETWORK = `eip155:${mezoTestnet.id}` as const;

/** x402 v2 HTTP headers. Each carries base64-encoded JSON. */
export const X402_HEADERS = {
  paymentRequired: "PAYMENT-REQUIRED",
  paymentSignature: "PAYMENT-SIGNATURE",
  paymentResponse: "PAYMENT-RESPONSE",
} as const;

export type X402ResourceInfo = { url: string; description?: string; mimeType?: string };

export type X402PaymentRequirements<Extra = Record<string, unknown>> = {
  scheme: string;
  network: string;
  /** Atomic units (MUSD has 18 decimals). */
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Extra;
};

export type X402PaymentRequired = {
  x402Version: number;
  error?: string;
  resource: X402ResourceInfo;
  accepts: X402PaymentRequirements[];
  extensions?: Record<string, unknown>;
};

export type X402PaymentPayload<Payload = Record<string, unknown>> = {
  x402Version: number;
  resource?: X402ResourceInfo;
  accepted: X402PaymentRequirements;
  payload: Payload;
  extensions?: Record<string, unknown>;
};

export type X402SettlementResponse = {
  success: boolean;
  transaction: string;
  network: string;
  payer?: string;
  errorReason?: string;
};

/** `extra` of a `mezout` scheme requirement: everything a client needs to pay the invoice. */
export type MezoutRequirementExtra = {
  /** EIP-2612 domain of the asset, as in x402's `exact` scheme. */
  name: string;
  version: string;
  invoice: string;
  checkoutUrl: string;
  router: string;
  relayUrl: string;
  expiresAt: string;
};

/** `payload` of a `mezout` scheme payment: proof that the invoice was paid. */
export type MezoutPaymentProof = { invoice: string; transaction: string; payer?: string };

const bytesToBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
const base64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Encodes a value as base64 UTF-8 JSON, for an x402 header. */
export function encodeX402Header(value: unknown): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(value)));
}

/** Decodes an x402 header. Throws on anything that is not base64 JSON. */
export function decodeX402Header<T = unknown>(header: string): T {
  return JSON.parse(new TextDecoder().decode(base64ToBytes(header.trim()))) as T;
}
