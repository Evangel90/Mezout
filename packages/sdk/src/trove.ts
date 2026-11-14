import type { Address, PublicClient } from "viem";
import { mezoTestnetAddresses as A } from "./addresses";
import {
  borrowerOperationsAbi,
  hintHelpersAbi,
  priceFeedAbi,
  sortedTrovesAbi,
  troveManagerAbi,
} from "./abi/mezo";

const DECIMAL = 10n ** 18n;
const NICR_PRECISION = 10n ** 20n;
export const MIN_BORROW_ICR = 16n * 10n ** 17n;
/** Ratios below this level get an explicit post-payment warning. */
export const TROVE_WARNING_ICR = 18n * 10n ** 17n;
/** Ratios below this level are shown as worth watching after checkout. */
export const TROVE_WATCH_ICR = 20n * 10n ** 17n;
/** Mezo's minimum collateral ratio: a trove below 110% can be liquidated. */
export const LIQUIDATION_ICR = 11n * 10n ** 17n;

export type TroveQuote = {
  active: boolean;
  recoveryMode: boolean;
  price: bigint;
  coll: bigint;
  debt: bigint;
  icrBefore: bigint;
  icrAfter: bigint;
  borrowFee: bigint;
  /** Mezo's one-off borrowing fee rate (18 decimals; 1e15 = 0.1%), added to the debt. */
  borrowRate: bigint;
  /** The trove's fixed yearly interest rate in basis points, which also applies to the borrowed amount. */
  interestRateBps: number;
  /** The BTC price at which the loan could be liquidated after this borrow. */
  liquidationPriceAfter: bigint;
  maxBorrowingCapacity: bigint;
  /** True when borrowing `amount` keeps the trove at or above 160% and under its capacity. */
  canBorrow: boolean;
};

/** A read-only view of a borrower's position after a payment has settled. */
export type TroveSnapshot = {
  active: boolean;
  recoveryMode: boolean;
  price: bigint;
  coll: bigint;
  debt: bigint;
  icr: bigint;
};

/** Everything a borrower needs to watch and manage a loan, read from Mezo in one go. */
export type LoanDetails = TroveSnapshot & {
  principal: bigint;
  /** Interest accrued and not yet paid. Repayments pay this first. */
  interest: bigint;
  /** The trove's fixed yearly interest rate, in basis points (100 = 1%). */
  interestRateBps: number;
  /** The BTC price (18 decimals) at which the ratio would hit 110% and the loan could be liquidated; 0 with no debt. */
  liquidationPrice: bigint;
  /** Mezo's minimum net debt for an open loan (debt minus the gas compensation reserve). */
  minNetDebt: bigint;
  /** MUSD held back by Mezo for liquidation gas; it is part of the debt and returned on close. */
  gasCompensation: bigint;
  /** The most `repayMUSD` accepts now: repaying more would take net debt under the minimum. */
  maxRepay: bigint;
  /** MUSD the wallet must hold to close the loan and get all its BTC back. */
  closeAmount: bigint;
};

export type TroveRisk = "healthy" | "watch" | "warning" | "critical" | "unavailable";

/**
 * A deliberately conservative UI classification. It does not change Mezo's
 * liquidation rules: the router's on-chain 160% floor remains authoritative.
 */
export function troveRisk(snapshot: Pick<TroveSnapshot, "active" | "icr">): TroveRisk {
  if (!snapshot.active) return "unavailable";
  if (snapshot.icr < MIN_BORROW_ICR) return "critical";
  if (snapshot.icr < TROVE_WARNING_ICR) return "warning";
  if (snapshot.icr < TROVE_WATCH_ICR) return "watch";
  return "healthy";
}

/** Reads the current trove state without projecting another borrow. */
export async function getTroveSnapshot(client: PublicClient, borrower: Address): Promise<TroveSnapshot> {
  const [status, price, dc] = await Promise.all([
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveStatus", args: [borrower] }),
    client.readContract({ address: A.priceFeed, abi: priceFeedAbi, functionName: "fetchPrice" }),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getEntireDebtAndColl", args: [borrower] }),
  ]);
  const recoveryMode = await client.readContract({
    address: A.troveManager,
    abi: troveManagerAbi,
    functionName: "checkRecoveryMode",
    args: [price],
  });
  const [c, principal, interest, pendingColl, pendingPrincipal, pendingInterest] = dc;
  const coll = c + pendingColl;
  const debt = principal + interest + pendingPrincipal + pendingInterest;
  const active = status === 1;
  return { active, recoveryMode, price, coll, debt, icr: debt === 0n ? 0n : (coll * price) / debt };
}

/** The BTC price at which `coll` backing `debt` falls to Mezo's 110% liquidation ratio. */
export const liquidationPrice = (coll: bigint, debt: bigint) => (coll === 0n || debt === 0n ? 0n : (debt * LIQUIDATION_ICR) / coll);

/**
 * Repayment limits from Mezo's BorrowerOperations: a repayment must leave net debt (debt minus gas compensation) at
 * or above `minNetDebt`, and closing burns everything except the gas compensation.
 */
export function repayLimits(debt: bigint, minNetDebt: bigint, gasCompensation: bigint) {
  const floor = minNetDebt + gasCompensation;
  return { maxRepay: debt > floor ? debt - floor : 0n, closeAmount: debt > gasCompensation ? debt - gasCompensation : 0n };
}

/** Reads a borrower's loan with its rate, liquidation price and repayment limits. Read-only. */
export async function getLoanDetails(client: PublicClient, borrower: Address): Promise<LoanDetails> {
  const [snapshot, rate, minNetDebt, gasCompensation, dc] = await Promise.all([
    getTroveSnapshot(client, borrower),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveInterestRate", args: [borrower] }),
    client.readContract({ address: A.borrowerOperations, abi: borrowerOperationsAbi, functionName: "minNetDebt" }),
    client.readContract({ address: A.borrowerOperations, abi: borrowerOperationsAbi, functionName: "MUSD_GAS_COMPENSATION" }),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getEntireDebtAndColl", args: [borrower] }),
  ]);
  const [, principal, interest, , pendingPrincipal, pendingInterest] = dc;
  return {
    ...snapshot,
    principal: principal + pendingPrincipal,
    interest: interest + pendingInterest,
    interestRateBps: Number(rate),
    liquidationPrice: liquidationPrice(snapshot.coll, snapshot.debt),
    minNetDebt,
    gasCompensation,
    ...(snapshot.active ? repayLimits(snapshot.debt, minNetDebt, gasCompensation) : { maxRepay: 0n, closeAmount: 0n }),
  };
}

/** Mirrors the checks MUSD and MezoutRouter make for a debt increase of `amount`. */
export async function quoteBorrow(client: PublicClient, borrower: Address, amount: bigint): Promise<TroveQuote> {
  const [status, price, rate, dc, capacity, interestRate] = await Promise.all([
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveStatus", args: [borrower] }),
    client.readContract({ address: A.priceFeed, abi: priceFeedAbi, functionName: "fetchPrice" }),
    client.readContract({ address: A.borrowerOperations, abi: borrowerOperationsAbi, functionName: "borrowingRate" }),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getEntireDebtAndColl", args: [borrower] }),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveMaxBorrowingCapacity", args: [borrower] }),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveInterestRate", args: [borrower] }),
  ]);
  const recoveryMode = await client.readContract({
    address: A.troveManager,
    abi: troveManagerAbi,
    functionName: "checkRecoveryMode",
    args: [price],
  });
  const [c, principal, interest, pendingColl, pendingPrincipal, pendingInterest] = dc;
  const coll = c + pendingColl;
  const debt = principal + interest + pendingPrincipal + pendingInterest;
  const borrowFee = (amount * rate) / DECIMAL;
  const newDebt = debt + amount + borrowFee;
  const icrBefore = debt === 0n ? 0n : (coll * price) / debt;
  const icrAfter = newDebt === 0n ? 0n : (coll * price) / newDebt;
  const active = status === 1;
  return {
    active,
    recoveryMode,
    price,
    coll,
    debt,
    icrBefore,
    icrAfter,
    borrowFee,
    borrowRate: rate,
    interestRateBps: Number(interestRate),
    liquidationPriceAfter: liquidationPrice(coll, newDebt),
    maxBorrowingCapacity: capacity,
    canBorrow: active && !recoveryMode && icrAfter >= MIN_BORROW_ICR && newDebt <= capacity,
  };
}

/** Insert-position hints for the trove after borrowing `amount` (NICR uses principal, as in TroveManager). */
export async function getBorrowHints(
  client: PublicClient,
  borrower: Address,
  amount: bigint,
): Promise<{ upperHint: Address; lowerHint: Address }> {
  const [dc, rate] = await Promise.all([
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getEntireDebtAndColl", args: [borrower] }),
    client.readContract({ address: A.borrowerOperations, abi: borrowerOperationsAbi, functionName: "borrowingRate" }),
  ]);
  const [coll, principal, , pendingColl, pendingPrincipal] = dc;
  const newPrincipal = principal + pendingPrincipal + amount + (amount * rate) / DECIMAL;
  return insertHints(client, ((coll + pendingColl) * NICR_PRECISION) / newPrincipal);
}

/**
 * The trove's nominal ratio after adding `collIncrease` BTC and repaying `repay` MUSD. Mezo applies a repayment to
 * accrued interest first and only the rest to principal, which is what the sorted list orders by.
 */
export function nicrAfterAdjustment(
  position: { coll: bigint; principal: bigint; interest: bigint },
  change: { collIncrease?: bigint; repay?: bigint },
) {
  const repay = change.repay ?? 0n;
  const principalPaid = repay > position.interest ? repay - position.interest : 0n;
  const newPrincipal = position.principal - principalPaid;
  const newColl = position.coll + (change.collIncrease ?? 0n);
  return newPrincipal <= 0n ? 0n : (newColl * NICR_PRECISION) / newPrincipal;
}

/** Insert-position hints for repaying MUSD or adding BTC collateral, so the borrower's transaction stays cheap. */
export async function getAdjustHints(
  client: PublicClient,
  borrower: Address,
  change: { collIncrease?: bigint; repay?: bigint },
): Promise<{ upperHint: Address; lowerHint: Address }> {
  const [coll, principal, interest, pendingColl, pendingPrincipal, pendingInterest] = await client.readContract({
    address: A.troveManager,
    abi: troveManagerAbi,
    functionName: "getEntireDebtAndColl",
    args: [borrower],
  });
  const nicr = nicrAfterAdjustment(
    { coll: coll + pendingColl, principal: principal + pendingPrincipal, interest: interest + pendingInterest },
    change,
  );
  return insertHints(client, nicr);
}

async function insertHints(client: PublicClient, nicr: bigint): Promise<{ upperHint: Address; lowerHint: Address }> {
  const count = await client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveOwnersCount" });
  const trials = 15n * BigInt(Math.ceil(Math.sqrt(Number(count)))) + 1n;
  const [hint] = await client.readContract({
    address: A.hintHelpers,
    abi: hintHelpersAbi,
    functionName: "getApproxHint",
    args: [nicr, trials, BigInt(Date.now())],
  });
  const [upperHint, lowerHint] = await client.readContract({
    address: A.sortedTroves,
    abi: sortedTrovesAbi,
    functionName: "findInsertPosition",
    args: [nicr, hint, hint],
  });
  return { upperHint, lowerHint };
}
