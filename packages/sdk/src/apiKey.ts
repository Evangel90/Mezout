import { getAddress, type Address } from "viem";

/** The exact text a merchant signs to get an API key. The server rebuilds it, so the client cannot change the wording. */
export function keyRequestMessage(address: Address, issuedAt: string): string {
  return [
    "Mezout: create an API key",
    `Payout address: ${getAddress(address)}`,
    `Issued at: ${issuedAt}`,
    "Network: Mezo testnet (31611)",
  ].join("\n");
}

/** The exact text a merchant signs to sign in to the dashboard. Signing costs no gas. */
export function signInMessage(address: Address, issuedAt: string): string {
  return [
    "Mezout: sign in to the dashboard",
    `Payout address: ${getAddress(address)}`,
    `Issued at: ${issuedAt}`,
    "Network: Mezo testnet (31611)",
  ].join("\n");
}
