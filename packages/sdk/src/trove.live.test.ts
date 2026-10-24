import { describe, expect, it } from "vitest";
import { createPublicClient, http, parseEther, zeroAddress } from "viem";
import { mezoTestnet } from "./chains";
import { getBorrowHints, quoteBorrow } from "./trove";

// Reads Mezo testnet; run with MEZO_LIVE=1 pnpm test.
const live = process.env.MEZO_LIVE === "1";
const client = createPublicClient({ chain: mezoTestnet, transport: http() });
const borrower = "0x52d033E64774F31A8B7562806aA5782CbbD29382";

describe.skipIf(!live)("live trove reads", () => {
  it("quotes a borrow on a real trove", async () => {
    const q = await quoteBorrow(client, borrower, parseEther("1000"));
    expect(q.active).toBe(true);
    expect(q.icrAfter).toBeLessThan(q.icrBefore);
    expect(q.borrowFee).toBe(parseEther("1"));
  }, 30_000);

  it("finds insert hints", async () => {
    const h = await getBorrowHints(client, borrower, parseEther("1000"));
    expect(h.upperHint === zeroAddress && h.lowerHint === zeroAddress).toBe(false);
  }, 30_000);
});
