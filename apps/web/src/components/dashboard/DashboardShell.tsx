"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMerchant } from "@/lib/merchant";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/payments", label: "Payments" },
  { href: "/dashboard/developers", label: "Developers" },
  { href: "/dashboard/account", label: "Account" },
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The signed-in dashboard: who is signed in, and one tab per job. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { address, method } = useMerchant();
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <button
          onClick={() => {
            navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy payout address"
          className="flex items-center gap-2 rounded-full border border-stone-200 bg-white py-1 pl-1.5 pr-3 text-sm hover:bg-stone-50"
        >
          <span className="rounded-full bg-stone-900 px-2 py-0.5 text-xs font-medium text-white">
            {method === "passkey" ? "Passkey account" : "Wallet"}
          </span>
          <span className="font-mono">{copied ? "Copied" : short(address)}</span>
        </button>
      </div>

      <nav className="-mx-4 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0" aria-label="Dashboard">
        <ul className="flex gap-6 text-sm">
          {TABS.map((t) => {
            const active = t.href === "/dashboard" ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px block whitespace-nowrap border-b-2 py-3 ${
                    active ? "border-stone-900 font-medium text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </div>
  );
}
