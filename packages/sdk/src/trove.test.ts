import { describe, expect, it } from "vitest";
import { MIN_BORROW_ICR, liquidationPrice, nicrAfterAdjustment, repayLimits, troveRisk } from "./trove";

describe("troveRisk", () => {
  it("keeps the protocol's 160% floor distinct from advisory warnings", () => {
    expect(troveRisk({ active: true, icr: MIN_BORROW_ICR - 1n })).toBe("critical");
    expect(troveRisk({ active: true, icr: MIN_BORROW_ICR })).toBe("warning");
    expect(troveRisk({ active: true, icr: 179n * 10n ** 16n })).toBe("warning");
    expect(troveRisk({ active: true, icr: 180n * 10n ** 16n })).toBe("watch");
    expect(troveRisk({ active: true, icr: 200n * 10n ** 16n })).toBe("healthy");
  });

  it("does not report a closed trove as safe", () => {
    expect(troveRisk({ active: false, icr: 300n * 10n ** 16n })).toBe("unavailable");
  });
});

describe("loan math", () => {
  const E18 = 10n ** 18n;

  it("puts the liquidation price where the ratio reaches 110%", () => {
    // 0.05 BTC backing 2,000 MUSD: 2,000 × 1.1 / 0.05 = $44,000.
    expect(liquidationPrice(5n * 10n ** 16n, 2_000n * E18)).toBe(44_000n * E18);
    expect(liquidationPrice(0n, 2_000n * E18)).toBe(0n);
    expect(liquidationPrice(E18, 0n)).toBe(0n);
  });

  it("keeps a repayment above Mezo's minimum net debt and prices a full close", () => {
    const minNetDebt = 1_800n * E18;
    const gas = 200n * E18;
    expect(repayLimits(2_021n * E18, minNetDebt, gas)).toEqual({ maxRepay: 21n * E18, closeAmount: 1_821n * E18 });
    expect(repayLimits(2_000n * E18, minNetDebt, gas).maxRepay).toBe(0n);
    expect(repayLimits(150n * E18, minNetDebt, gas)).toEqual({ maxRepay: 0n, closeAmount: 0n });
  });

  it("applies repayments to interest before principal when ordering the trove", () => {
    const position = { coll: E18, principal: 2_000n * E18, interest: 10n * E18 };
    // Repaying only interest leaves principal, and so the nominal ratio, unchanged.
    expect(nicrAfterAdjustment(position, { repay: 10n * E18 })).toBe(nicrAfterAdjustment(position, {}));
    // Repaying 110 MUSD pays 10 interest and 100 principal: 1 BTC / 1,900 principal.
    expect(nicrAfterAdjustment(position, { repay: 110n * E18 })).toBe((E18 * 10n ** 20n) / (1_900n * E18));
    expect(nicrAfterAdjustment(position, { collIncrease: E18 })).toBe((2n * E18 * 10n ** 20n) / (2_000n * E18));
  });
});
