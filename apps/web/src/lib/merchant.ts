"use client";

import { createContext, useContext } from "react";
import type { Address, Hex } from "viem";
import type { PasskeySession } from "@/lib/passkey";

/** How the merchant signed in. Each is a separate merchant account with its own payout address. */
export type SignInMethod = "passkey" | "wallet";

/** The signed-in merchant, provided to every dashboard page by MerchantGate. */
export type Merchant = {
  address: Address;
  method: SignInMethod;
  passkey: PasskeySession | null;
  /** Sends MUSD from the payout address (for refunds), through whichever account the merchant uses. */
  sendMusd: (to: Address, amount: bigint) => Promise<Hex>;
  signOut: () => Promise<void>;
};

export const MerchantContext = createContext<Merchant | null>(null);

export function useMerchant(): Merchant {
  const merchant = useContext(MerchantContext);
  if (!merchant) throw new Error("useMerchant is only available inside the dashboard");
  return merchant;
}
