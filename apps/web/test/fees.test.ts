import { describe, expect, it } from "vitest";
import { merchantFee, merchantFeeBps, merchantSettlement } from "@/lib/server/fees";

describe("merchant-paid fees", () => {
  it("defaults testnet invoices to a 1% merchant-paid fee", () => {
    expect(merchantFeeBps()).toBe(100n);
    expect(merchantSettlement(25_500_000_000_000_000_000n)).toEqual({ fee: 255_000_000_000_000_000n, net: 25_245_000_000_000_000_000n });
  });

  it("accepts an explicit zero fee and rejects unsafe configuration", () => {
    expect(merchantFee(123n, merchantFeeBps("0"))).toBe(0n);
    expect(() => merchantFeeBps("1001")).toThrow(/0 and 1000/);
    expect(() => merchantFeeBps("1.5")).toThrow(/integer/);
  });
});
