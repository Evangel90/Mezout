import type { Metadata } from "next";
import { getAddress, isAddress } from "viem";
import { LoanManager } from "@/components/loan/LoanManager";

export const metadata: Metadata = {
  title: "Your Mezo loan",
  description: "Customers who borrowed MUSD against their Bitcoin at a Mezout checkout: check your loan's health, repay MUSD, add BTC or close it.",
};

// /loan, or /loan?address=0x… to open a specific wallet's loan (read-only unless that wallet is connected).
export default function LoanPage({ searchParams }: { searchParams: { address?: string } }) {
  const address = searchParams.address && isAddress(searchParams.address) ? getAddress(searchParams.address) : null;
  return <LoanManager initialAddress={address} />;
}
