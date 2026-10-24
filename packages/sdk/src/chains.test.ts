import { describe, expect, it } from "vitest";
import { mezoTestnet } from "./chains";

describe("mezoTestnet", () => {
  it("uses chain id 31611", () => {
    expect(mezoTestnet.id).toBe(31611);
  });
});
