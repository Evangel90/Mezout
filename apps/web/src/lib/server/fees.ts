import "server-only";

const BPS_DENOMINATOR = 10_000n;
// Keep a configuration error from silently turning an invoice into a near-total platform fee.
const MAX_MERCHANT_FEE_BPS = 1_000n;

/**
 * The merchant-paid fee for newly created invoices, in basis points.
 *
 * Testnet intentionally defaults to 1% so the complete settlement path is exercised. Set
 * MERCHANT_FEE_BPS=0 to pause new fees, or an integer from 0 to 1000 for another rate.
 * Existing signed invoices retain the fee they were created with.
 */
export function merchantFeeBps(value = process.env.MERCHANT_FEE_BPS ?? "100"): bigint {
  if (!/^\d+$/.test(value)) throw new Error("MERCHANT_FEE_BPS must be an integer between 0 and 1000");
  const bps = BigInt(value);
  if (bps > MAX_MERCHANT_FEE_BPS) throw new Error("MERCHANT_FEE_BPS must be between 0 and 1000");
  return bps;
}

/** The fee is deducted from the merchant settlement; the payer always pays `amount`. */
export function merchantFee(amount: bigint, bps = merchantFeeBps()): bigint {
  return (amount * bps) / BPS_DENOMINATOR;
}

export function merchantSettlement(amount: bigint, bps = merchantFeeBps()) {
  const fee = merchantFee(amount, bps);
  return { fee, net: amount - fee };
}

export const merchantFeeLimits = { denominator: BPS_DENOMINATOR, maxBps: MAX_MERCHANT_FEE_BPS };
