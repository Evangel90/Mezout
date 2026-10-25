"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { useMerchant } from "@/lib/merchant";
import { useMusdBalance } from "@/lib/useMusdBalance";

/** The payout address's MUSD balance, with what the merchant can do with it. */
export function BalanceCard() {
  const { address, method } = useMerchant();
  const { balance } = useMusdBalance(address);
  return (
    <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-stone-200 bg-white p-6">
      <div className="space-y-1">
        <p className="text-sm text-stone-600">{method === "passkey" ? "Balance in your passkey account" : "MUSD in your wallet"}</p>
        <p className="text-3xl font-semibold tracking-tight">
          {balance === null ? "…" : Number(formatUnits(balance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
          <span className="text-base font-normal text-stone-500">MUSD</span>
        </p>
      </div>
      {method === "passkey" ? (
        <Link href="/dashboard/account" className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100">
          Withdraw
        </Link>
      ) : (
        <p className="text-xs text-stone-500">Payments arrive in your wallet directly.</p>
      )}
    </section>
  );
}
