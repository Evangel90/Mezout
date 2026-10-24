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

export type TroveQuote = {
  active: boolean;
  recoveryMode: boolean;
  price: bigint;
  coll: bigint;
  debt: bigint;
  icrBefore: bigint;
  icrAfter: bigint;
  borrowFee: bigint;
  maxBorrowingCapacity: bigint;
  /** True when borrowing `amount` keeps the trove at or above 160% and under its capacity. */
  canBorrow: boolean;
};

/** Mirrors the checks MUSD and MezoutRouter make for a debt increase of `amount`. */
export async function quoteBorrow(client: PublicClient, borrower: Address, amount: bigint): Promise<TroveQuote> {
  const [status, price, rate, dc, capacity] = await Promise.all([
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveStatus", args: [borrower] }),
    client.readContract({ address: A.priceFeed, abi: priceFeedAbi, functionName: "fetchPrice" }),
    client.readContract({ address: A.borrowerOperations, abi: borrowerOperationsAbi, functionName: "borrowingRate" }),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getEntireDebtAndColl", args: [borrower] }),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveMaxBorrowingCapacity", args: [borrower] }),
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
  const [dc, rate, count] = await Promise.all([
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getEntireDebtAndColl", args: [borrower] }),
    client.readContract({ address: A.borrowerOperations, abi: borrowerOperationsAbi, functionName: "borrowingRate" }),
    client.readContract({ address: A.troveManager, abi: troveManagerAbi, functionName: "getTroveOwnersCount" }),
  ]);
  const [coll, principal, , pendingColl, pendingPrincipal] = dc;
  const newPrincipal = principal + pendingPrincipal + amount + (amount * rate) / DECIMAL;
  const nicr = ((coll + pendingColl) * NICR_PRECISION) / newPrincipal;
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
