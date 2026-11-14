import { getAddress, isAddressEqual, type Address, type PublicClient } from "viem";
import { mezoTestnetAddresses as A } from "./addresses";
import { borrowerOperationsAbi, priceFeedAbi, troveManagerAbi } from "./abi/mezo";
import { LIQUIDATION_ICR } from "./trove";

const NICR_PRECISION = 10n ** 20n;

/**
 * How redemptions work on Mezo (TroveManager.redeemCollateral, mezo-org/musd): anyone can hand in MUSD for $1 of BTC
 * per MUSD. Mezo takes it from loans in SortedTroves order, starting at `getLast()` (the lowest nominal ratio, which
 * is collateral ÷ principal, without interest) and walking `getPrev`. Loans whose ratio at the current price is under
 * the 110% MCR are skipped (they are for liquidation instead). Each loan gives up at most its whole debt minus the
 * 200 MUSD gas reserve (interest first, then principal), and a loan that is fully redeemed is closed. So before
 * Mezo reaches a given loan, every eligible loan below it must be redeemed in full.
 */
export type QueuedTrove = {
  owner: Address;
  coll: bigint;
  principal: bigint;
  interest: bigint;
  /** principal + interest, including pending redistribution rewards: what `_getTotalDebt` sees. */
  debt: bigint;
  /** collateral × 1e20 ÷ principal, as `TroveManager.getNominalICR`: the key SortedTroves orders by. */
  nicr: bigint;
};

export type RedemptionQueue = {
  price: bigint;
  gasCompensation: bigint;
  /** Mezo's minimum collateral ratio (110%): loans below it are skipped by redemptions. */
  mcr: bigint;
  /** Every open loan in redemption order: the first one is redeemed first. */
  troves: QueuedTrove[];
  readAt: number;
};

export type RedemptionExposure = "high" | "medium" | "low" | "none";

export type RedemptionPosition = {
  /** 1 = the next loan a redemption would take. 0 when the loan is not in line (closed, or under 110%). */
  position: number;
  /** Loans currently in line for redemption (open and at or above 110%). */
  eligibleCount: number;
  /** MUSD that has to be redeemed from other loans before any is taken from this one. */
  debtAhead: bigint;
  /** MUSD redeemable across every loan in line, this one included. */
  totalRedeemable: bigint;
  /** The most a redemption can take from this loan: its debt minus the gas reserve. */
  ownRedeemable: bigint;
  exposure: RedemptionExposure;
};

/**
 * When fewer than this many MUSD of other loans stand in front of a loan, one sizeable redemption could reach it.
 * On testnet (14 Nov 2026) the 30 lowest of 326 loans sit inside 100,000 MUSD of each other, so these are absolute
 * MUSD buffers rather than a share of system debt, which a single 426M MUSD loan dominates. Owner-tunable.
 */
export const REDEMPTION_HIGH_BUFFER = 50_000n * 10n ** 18n;
/** Below this buffer the loan is worth keeping an eye on. */
export const REDEMPTION_MEDIUM_BUFFER = 500_000n * 10n ** 18n;

export const nominalRatio = (coll: bigint, principal: bigint) => (principal === 0n ? 2n ** 256n - 1n : (coll * NICR_PRECISION) / principal);

/**
 * Orders loans as SortedTroves does, lowest nominal ratio first. Ties keep the input order, which SortedTroves
 * decides by insertion; `redemptionPosition` treats a tie as not ahead, so it never overstates the buffer.
 */
export function orderForRedemption<T extends Pick<QueuedTrove, "nicr">>(troves: T[]): T[] {
  return [...troves].sort((a, b) => (a.nicr < b.nicr ? -1 : a.nicr > b.nicr ? 1 : 0));
}

/** Plain classification of how close a loan is to being redeemed, from the MUSD that stands in front of it. */
export function redemptionExposure(debtAhead: bigint, eligible: boolean): RedemptionExposure {
  if (!eligible) return "none";
  if (debtAhead < REDEMPTION_HIGH_BUFFER) return "high";
  if (debtAhead < REDEMPTION_MEDIUM_BUFFER) return "medium";
  return "low";
}

const isEligible = (t: QueuedTrove, price: bigint, mcr: bigint) => t.debt > 0n && (t.coll * price) / t.debt >= mcr;
const redeemable = (t: QueuedTrove, gasCompensation: bigint) => (t.debt > gasCompensation ? t.debt - gasCompensation : 0n);

/**
 * Where `borrower` sits in Mezo's redemption order and how much MUSD would be redeemed before it is reached. Pure:
 * pass a queue from `getRedemptionQueue`, or a fixed set of loans in tests.
 */
export function redemptionPosition(queue: Omit<RedemptionQueue, "readAt">, borrower: Address): RedemptionPosition {
  const { price, gasCompensation, mcr } = queue;
  const troves = orderForRedemption(queue.troves);
  const own = troves.find((t) => isAddressEqual(t.owner, borrower));
  let eligibleCount = 0;
  let totalRedeemable = 0n;
  let debtAhead = 0n;
  let ahead = 0;
  for (const t of troves) {
    if (!isEligible(t, price, mcr)) continue;
    eligibleCount++;
    const r = redeemable(t, gasCompensation);
    totalRedeemable += r;
    if (own && t !== own && t.nicr < own.nicr) {
      debtAhead += r;
      ahead++;
    }
  }
  const inLine = !!own && isEligible(own, price, mcr);
  return {
    position: inLine ? ahead + 1 : 0,
    eligibleCount,
    debtAhead: inLine ? debtAhead : 0n,
    totalRedeemable,
    ownRedeemable: own ? redeemable(own, gasCompensation) : 0n,
    exposure: redemptionExposure(debtAhead, inLine),
  };
}

/** Canonical Multicall3, deployed on Mezo testnet (checked with `cast code`). */
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const CHUNK = 100;

async function chunked<T, R>(items: T[], size: number, fn: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return (await Promise.all(chunks.map(fn))).flat();
}

/**
 * Reads every open loan once and orders it for redemption. A few batched calls whatever the number of loans: the
 * owner list and each loan's debt and collateral go through Multicall3 in chunks of 100. Read-only.
 */
export async function getRedemptionQueue(client: PublicClient, now = Date.now()): Promise<RedemptionQueue> {
  const [count, price, gasCompensation, mcr] = await Promise.all([
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveOwnersCount" }),
    client.readContract({ address: A.priceFeed, abi: priceFeedAbi, functionName: "fetchPrice" }),
    client.readContract({ address: A.borrowerOperations, abi: borrowerOperationsAbi, functionName: "MUSD_GAS_COMPENSATION" }),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "MCR" }).catch(() => LIQUIDATION_ICR),
  ]);
  const indexes = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const owners = await chunked(indexes, CHUNK, (chunk) =>
    client.multicall({
      multicallAddress: MULTICALL3,
      allowFailure: false,
      contracts: chunk.map((i) => ({
        address: A.troveManager,
        abi: troveManagerAbi,
        functionName: "getTroveFromTroveOwnersArray" as const,
        args: [i] as const,
      })),
    }),
  );
  const positions = await chunked(owners, CHUNK, (chunk) =>
    client.multicall({
      multicallAddress: MULTICALL3,
      allowFailure: false,
      contracts: chunk.map((owner) => ({
        address: A.troveManager,
        abi: troveManagerAbi,
        functionName: "getEntireDebtAndColl" as const,
        args: [owner] as const,
      })),
    }),
  );
  const troves = owners.map((owner, i): QueuedTrove => {
    const [c, p, interest, pendingColl, pendingPrincipal, pendingInterest] = positions[i];
    const coll = c + pendingColl;
    const principal = p + pendingPrincipal;
    const totalInterest = interest + pendingInterest;
    return { owner: getAddress(owner), coll, principal, interest: totalInterest, debt: principal + totalInterest, nicr: nominalRatio(coll, principal) };
  });
  return { price, gasCompensation, mcr, troves: orderForRedemption(troves), readAt: now };
}
