"use client";

import Link from "next/link";
import { formatUnits, parseUnits } from "viem";
import { Skeleton } from "@/components/ui";
import { useMerchant } from "@/lib/merchant";
import { useMusdBalance } from "@/lib/useMusdBalance";
import type { Order } from "@/lib/useOrders";

const DAY = 24 * 60 * 60 * 1000;
const show = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Three numbers a merchant checks first: what they hold, what they took in lately, and what is still unpaid. */
export function OverviewStats({ orders }: { orders: Order[] | null }) {
  const { address, method } = useMerchant();
  const { balance } = useMusdBalance(address);

  const since = Date.now() - 30 * DAY;
  const recent = (orders ?? []).filter((o) => o.paidAt && new Date(o.paidAt).getTime() >= since);
  const netRecent = recent.reduce((sum, o) => sum + parseUnits(o.net, 18) - parseUnits(o.refunded, 18), 0n);
  const pending = (orders ?? []).filter((o) => o.status === "pending");
  const pendingTotal = pending.reduce((sum, o) => sum + parseUnits(o.amount, 18), 0n);

  return (
    <dl className="grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 shadow-sm shadow-stone-900/[0.03] sm:grid-cols-3">
      <Stat
        label={method === "passkey" ? "Available balance" : "MUSD in your wallet"}
        value={balance === null ? null : show(balance)}
        footer={
          method === "passkey" ? (
            <Link href="/dashboard/account#withdraw" className="font-medium text-stone-900 underline underline-offset-2">
              Withdraw
            </Link>
          ) : (
            "Payments arrive in your wallet directly"
          )
        }
      />
      <Stat
        label="Net received, last 30 days"
        value={orders === null ? null : show(netRecent)}
        footer={orders === null ? " " : `${recent.length} payment${recent.length === 1 ? "" : "s"}, after fees and refunds`}
      />
      <Stat
        label="Awaiting payment"
        value={orders === null ? null : show(pendingTotal)}
        footer={orders === null ? " " : `${pending.length} open link${pending.length === 1 ? "" : "s"}`}
      />
    </dl>
  );
}

function Stat({ label, value, footer }: { label: string; value: string | null; footer: React.ReactNode }) {
  return (
    <div className="space-y-1 bg-white p-5">
      <dt className="text-sm text-stone-600">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight tabular-nums text-stone-900">
        {value === null ? (
          <Skeleton className="my-1 h-7 w-28" />
        ) : (
          <>
            {value} <span className="text-sm font-normal text-stone-500">MUSD</span>
          </>
        )}
      </dd>
      <dd className="text-xs text-stone-500">{footer}</dd>
    </div>
  );
}
