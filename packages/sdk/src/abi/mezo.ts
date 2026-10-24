import { parseAbi } from "viem";

export const musdAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
]);

export const troveManagerAbi = parseAbi([
  "function getTroveStatus(address borrower) view returns (uint8)",
  "function getCurrentICR(address borrower, uint256 price) view returns (uint256)",
  "function checkRecoveryMode(uint256 price) view returns (bool)",
  "function getTroveMaxBorrowingCapacity(address borrower) view returns (uint256)",
  "function getEntireDebtAndColl(address borrower) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingCollateral, uint256 pendingPrincipal, uint256 pendingInterest)",
  "function getTroveOwnersCount() view returns (uint256)",
]);

export const priceFeedAbi = parseAbi(["function fetchPrice() view returns (uint256)"]);

export const hintHelpersAbi = parseAbi([
  "function getApproxHint(uint256 CR, uint256 numTrials, uint256 inputRandomSeed) view returns (address hintAddress, uint256 diff, uint256 latestRandomSeed)",
]);

export const sortedTrovesAbi = parseAbi([
  "function findInsertPosition(uint256 NICR, address prevId, address nextId) view returns (address, address)",
]);

export const borrowerOperationsSignaturesAbi = parseAbi([
  "function getNonce(address user) view returns (uint256)",
]);

export const borrowerOperationsAbi = parseAbi(["function borrowingRate() view returns (uint256)"]);
