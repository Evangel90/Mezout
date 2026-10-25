import type { Address, Hex } from "viem";
import { mezoTestnet } from "./chains";
import { mezoTestnetAddresses } from "./addresses";

export type Invoice = {
  merchant: Address;
  amount: bigint;
  fee: bigint;
  orderId: Hex;
  expiry: bigint;
};

const invoiceFields = [
  { name: "merchant", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "fee", type: "uint256" },
  { name: "orderId", type: "bytes32" },
  { name: "expiry", type: "uint64" },
] as const;

export const invoiceTypes = { Invoice: invoiceFields } as const;

export const paymentTypes = {
  Payment: [
    { name: "invoice", type: "Invoice" },
    { name: "payer", type: "address" },
  ],
  Invoice: invoiceFields,
} as const;

/** The payer's terms for a swap payment: input token, slippage cap and quote deadline. */
export type SwapLimit = { maxAmountIn: bigint; deadline: bigint };

export const swapPaymentTypes = {
  SwapPayment: [
    { name: "invoice", type: "Invoice" },
    { name: "payer", type: "address" },
    { name: "tokenIn", type: "address" },
    { name: "maxAmountIn", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Invoice: invoiceFields,
} as const;

export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const withdrawMusdTypes = {
  WithdrawMUSD: [
    { name: "amount", type: "uint256" },
    { name: "borrower", type: "address" },
    { name: "recipient", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const routerDomain = (router: Address, chainId: number = mezoTestnet.id) =>
  ({ name: "MezoutRouter", version: "1", chainId, verifyingContract: router }) as const;

export const musdDomain = (chainId: number = mezoTestnet.id) =>
  ({ name: "Mezo USD", version: "1", chainId, verifyingContract: mezoTestnetAddresses.musd }) as const;

/** Permit domains of Mezo's BTC and MEZO precompile tokens, matched against their DOMAIN_SEPARATOR on testnet. */
export const btcDomain = (chainId: number = mezoTestnet.id) =>
  ({ name: "BTC", version: "1", chainId, verifyingContract: mezoTestnetAddresses.btcToken }) as const;

export const mezoDomain = (chainId: number = mezoTestnet.id) =>
  ({ name: "MEZO", version: "1", chainId, verifyingContract: mezoTestnetAddresses.mezoToken }) as const;

export const borrowerOperationsSignaturesDomain = (chainId: number = mezoTestnet.id) =>
  ({
    name: "BorrowerOperationsSignatures",
    version: "1",
    chainId,
    verifyingContract: mezoTestnetAddresses.borrowerOperationsSignatures,
  }) as const;
