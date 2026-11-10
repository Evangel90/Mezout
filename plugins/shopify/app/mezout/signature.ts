import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the Mezout-Signature header, the same scheme as the WooCommerce plugin and examples/webhook-receiver.
 *
 * The header is "t=<unix seconds>,v1=<hex>", where v1 is HMAC-SHA256 of "<t>.<raw body>" keyed with the endpoint's
 * signing secret. Timestamps more than five minutes from our clock are rejected, so a captured request cannot be
 * replayed later.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyMezoutSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  { now = Date.now(), toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS } = {},
): boolean {
  if (!secret || !header) return false;
  const parts: Record<string, string> = {};
  for (const pair of header.split(",")) {
    const i = pair.indexOf("=");
    if (i > 0) parts[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !/^\d+$/.test(t) || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const given = v1.toLowerCase();
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Builds a header the way Mezout does. For tests and local tooling. */
export function signMezoutPayload(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}
