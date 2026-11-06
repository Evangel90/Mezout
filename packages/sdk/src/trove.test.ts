import { describe, expect, it } from "vitest";
import { MIN_BORROW_ICR, troveRisk } from "./trove";

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
