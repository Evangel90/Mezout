/**
 * Deciding whether a Shopify order was placed with the Mezout manual payment method.
 *
 * Shopify reports a manual payment method by the name the merchant gave it, in the order's payment_gateway_names.
 * An order is Mezout's when one of those names equals the name set in the app (ignoring case, spacing and
 * punctuation), or contains the word "Mezout" — so "Pay with Bitcoin or MUSD (Mezout)" matches by default.
 */
export const DEFAULT_GATEWAY_NAME = "Pay with Bitcoin or MUSD (Mezout)";

/** Lowercase letters and digits only, words separated by one space. */
export function normalizeGatewayName(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isMezoutGateway(gatewayNames: unknown, configuredName: string = DEFAULT_GATEWAY_NAME): boolean {
  if (!Array.isArray(gatewayNames)) return false;
  const wanted = normalizeGatewayName(configuredName || "");
  return gatewayNames.some((raw) => {
    if (typeof raw !== "string") return false;
    const name = normalizeGatewayName(raw);
    if (name === "") return false;
    return (wanted !== "" && name === wanted) || name.split(" ").includes("mezout");
  });
}

/** Shop currencies Mezout can charge at 1:1. Shopify has no MUSD currency, so this is US dollars only. */
export const SUPPORTED_CURRENCIES = ["USD"] as const;

export function isSupportedCurrency(currency: unknown): boolean {
  return typeof currency === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(currency.toUpperCase());
}
