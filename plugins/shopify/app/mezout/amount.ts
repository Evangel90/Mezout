/**
 * Decimal amount helpers. Mezout sends amounts as decimal strings in their shortest form ("25", "0.5"); Shopify sends
 * "25.00" in webhooks and "25.0" in GraphQL money. Amounts are compared as decimals, never as floats.
 */

/** "025.500" → "25.5", "25.00" → "25", "0.0" → "0". Returns null for anything that is not a plain decimal. */
export function normalizeAmount(amount: unknown): string | null {
  if (typeof amount !== "string" && typeof amount !== "number") return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(amount).trim());
  if (!m) return null;
  const whole = m[1].replace(/^0+/, "") || "0";
  const fraction = (m[2] ?? "").replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

/** True when both are the same decimal amount, whatever their formatting. */
export function amountsEqual(a: unknown, b: unknown): boolean {
  const na = normalizeAmount(a);
  return na !== null && na === normalizeAmount(b);
}

/** True for a decimal greater than zero. */
export function isPositiveAmount(amount: unknown): boolean {
  const n = normalizeAmount(amount);
  return n !== null && n !== "0";
}

/** Adds decimal strings exactly (used to total refund transactions). Returns null if any part is not a decimal. */
export function sumAmounts(amounts: unknown[]): string | null {
  let scale = 0;
  const parts: string[] = [];
  for (const a of amounts) {
    const n = normalizeAmount(a);
    if (n === null) return null;
    parts.push(n);
    scale = Math.max(scale, (n.split(".")[1] ?? "").length);
  }
  let total = 0n;
  for (const p of parts) {
    const [w, f = ""] = p.split(".");
    total += BigInt(w + f.padEnd(scale, "0"));
  }
  const digits = total.toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale ? digits.slice(digits.length - scale) : "";
  return normalizeAmount(fraction ? `${whole}.${fraction}` : whole);
}
