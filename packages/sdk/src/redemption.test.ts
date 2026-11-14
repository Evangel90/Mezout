import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  REDEMPTION_HIGH_BUFFER,
  REDEMPTION_MEDIUM_BUFFER,
  nominalRatio,
  orderForRedemption,
  redemptionExposure,
  redemptionPosition,
  type QueuedTrove,
} from "./redemption";

const E18 = 10n ** 18n;
const GAS = 200n * E18;
const MCR = 11n * 10n ** 17n;
const PRICE = 100_000n * E18; // $100,000 per BTC

const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
/** A loan of `debt` MUSD (all principal unless interest is given) at `ratio`% collateral. */
function trove(n: number, ratio: number, debt: bigint, interest = 0n): QueuedTrove {
  const total = debt * E18;
  const coll = (total * BigInt(ratio)) / 100n / 100_000n;
  const principal = total - interest * E18;
  return { owner: addr(n), coll, principal, interest: interest * E18, debt: total, nicr: nominalRatio(coll, principal) };
}
const queue = (troves: QueuedTrove[]) => ({ price: PRICE, gasCompensation: GAS, mcr: MCR, troves });

describe("redemption order", () => {
  it("sorts by nominal ratio, lowest first, as SortedTroves.getLast/getPrev walks", () => {
    const set = [trove(1, 200, 5_000n), trove(2, 120, 2_000n), trove(3, 150, 3_000n)];
    expect(orderForRedemption(set).map((t) => t.owner)).toEqual([addr(2), addr(3), addr(1)]);
  });

  it("counts every eligible loan in front, each down to its 200 MUSD gas reserve", () => {
    const set = [trove(1, 300, 10_000n), trove(2, 120, 2_000n), trove(3, 150, 3_000n), trove(4, 180, 4_000n)];
    const p = redemptionPosition(queue(set), addr(4));
    // Loans 2 and 3 are redeemed first: (2,000 − 200) + (3,000 − 200).
    expect(p.position).toBe(3);
    expect(p.debtAhead).toBe(4_600n * E18);
    expect(p.ownRedeemable).toBe(3_800n * E18);
    expect(p.eligibleCount).toBe(4);
    expect(p.totalRedeemable).toBe((1_800n + 2_800n + 3_800n + 9_800n) * E18);
    expect(redemptionPosition(queue(set), addr(2))).toMatchObject({ position: 1, debtAhead: 0n, exposure: "high" });
  });

  it("skips loans under 110%, which redemptions pass over", () => {
    const set = [trove(1, 105, 50_000n), trove(2, 109, 9_000n), trove(3, 130, 3_000n)];
    const p = redemptionPosition(queue(set), addr(3));
    expect(p).toMatchObject({ position: 1, debtAhead: 0n, eligibleCount: 1 });
    // The liquidatable loan itself is not in line for redemption.
    expect(redemptionPosition(queue(set), addr(1))).toMatchObject({ position: 0, exposure: "none", debtAhead: 0n });
  });

  it("orders by principal only but checks eligibility with interest included", () => {
    // Same collateral and principal, so the same nominal ratio; interest pushes loan 1 under 110% at today's price.
    const coll = (2_000n * E18 * 112n) / 100n / 100_000n;
    const a: QueuedTrove = { owner: addr(1), coll, principal: 2_000n * E18, interest: 100n * E18, debt: 2_100n * E18, nicr: nominalRatio(coll, 2_000n * E18) };
    const b = trove(2, 140, 3_000n);
    expect(redemptionPosition(queue([a, b]), addr(2))).toMatchObject({ position: 1, debtAhead: 0n });
  });

  it("does not count loans with an equal ratio as ahead", () => {
    const set = [trove(1, 150, 3_000n), trove(2, 150, 3_000n)];
    expect(redemptionPosition(queue(set), addr(2))).toMatchObject({ position: 1, debtAhead: 0n });
    expect(redemptionPosition(queue(set), addr(1))).toMatchObject({ position: 1, debtAhead: 0n });
  });

  it("reports a wallet with no open loan as not in line", () => {
    const p = redemptionPosition(queue([trove(1, 150, 3_000n)]), addr(9));
    expect(p).toMatchObject({ position: 0, debtAhead: 0n, ownRedeemable: 0n, exposure: "none", eligibleCount: 1 });
  });

  it("classifies exposure by the MUSD in front", () => {
    expect(redemptionExposure(0n, true)).toBe("high");
    expect(redemptionExposure(REDEMPTION_HIGH_BUFFER - 1n, true)).toBe("high");
    expect(redemptionExposure(REDEMPTION_HIGH_BUFFER, true)).toBe("medium");
    expect(redemptionExposure(REDEMPTION_MEDIUM_BUFFER, true)).toBe("low");
    expect(redemptionExposure(0n, false)).toBe("none");
    // 30 loans of 2,000 MUSD in front (54,000 redeemable) is past the high mark.
    const many = Array.from({ length: 30 }, (_, i) => trove(i + 1, 120, 2_000n));
    expect(redemptionPosition(queue([...many, trove(99, 160, 2_000n)]), addr(99))).toMatchObject({
      position: 31,
      debtAhead: 54_000n * E18,
      exposure: "medium",
    });
  });
});
