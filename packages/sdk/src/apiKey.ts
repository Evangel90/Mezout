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
