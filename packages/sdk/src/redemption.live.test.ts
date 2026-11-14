import { describe, expect, it } from "vitest";
import { createPublicClient, formatEther, http, zeroAddress, type Address } from "viem";
import { mezoTestnetAddresses as A } from "./addresses";
import { sortedTrovesAbi, troveManagerAbi } from "./abi/mezo";
import { mezoTestnet } from "./chains";
import { getRedemptionQueue, redemptionPosition } from "./redemption";

// Reads Mezo testnet; run with MEZO_LIVE=1 pnpm test. MEZO_LIVE_FULL=1 walks the whole SortedTroves list.
const live = process.env.MEZO_LIVE === "1";
const full = process.env.MEZO_LIVE_FULL === "1";
const client = createPublicClient({ chain: mezoTestnet, transport: http() });

describe.skipIf(!live)("live redemption order", () => {
  it("matches SortedTroves walked from getLast, and getNominalICR", async () => {
    const started = Date.now();
    const queue = await getRedemptionQueue(client);
    console.log(`getRedemptionQueue read ${queue.troves.length} loans in ${Date.now() - started} ms`);
    const size = await client.readContract({ address: A.sortedTroves, abi: sortedTrovesAbi, functionName: "getSize" });
    expect(queue.troves.length).toBe(Number(size));

    // Walk the on-chain list from the lowest ratio (redeemed first) and compare it with our order.
    const steps = full ? queue.troves.length : 25;
    const walked: Address[] = [];
    let id = await client.readContract({ address: A.sortedTroves, abi: sortedTrovesAbi, functionName: "getLast" });
    while (id !== zeroAddress && walked.length < steps) {
      walked.push(id);
      id = await client.readContract({ address: A.sortedTroves, abi: sortedTrovesAbi, functionName: "getPrev", args: [id] });
    }
    let mismatches = 0;
    walked.forEach((w, i) => {
      if (w === queue.troves[i].owner) return;
      // Equal nominal ratios may sit in either order.
      mismatches++;
      expect(queue.troves.find((t) => t.owner === w)?.nicr).toBe(queue.troves[i].nicr);
    });

    for (const t of queue.troves.slice(0, 10)) {
      const onChain = await client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getNominalICR", args: [t.owner] });
      expect(t.nicr).toBe(onChain);
    }

    const p = redemptionPosition(queue, "0x52d033E64774F31A8B7562806aA5782CbbD29382");
    console.log(
      `troves ${queue.troves.length}, walked ${walked.length}, tie swaps ${mismatches}, eligible ${p.eligibleCount}, ` +
        `redeemable ${formatEther(p.totalRedeemable)} MUSD; sample borrower #${p.position}, ${formatEther(p.debtAhead)} MUSD ahead (${p.exposure})`,
    );
    if (full) {
      let cum = 0n;
      const rows = queue.troves.map((t, i) => {
        const icr = t.debt ? Number((t.coll * queue.price * 1000n) / t.debt / 10n ** 18n) / 10 : 0;
        const line = `${i + 1} ${t.owner} icr=${icr}% debt=${Number(formatEther(t.debt)).toFixed(0)} ahead=${Number(formatEther(cum)).toFixed(0)}`;
        if (icr >= 110) cum += t.debt > queue.gasCompensation ? t.debt - queue.gasCompensation : 0n;
        return line;
      });
      console.log(rows.filter((_, i) => i < 40 || i % 25 === 0).join("\n"));
    }
  }, 600_000);
});
