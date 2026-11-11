"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CodeIcon, CopyIcon, CheckIcon, ExternalIcon, HomeIcon, ReceiptIcon, UserIcon, useCopy } from "@/components/ui";
import { useMerchant } from "@/lib/merchant";

const TABS = [
  { href: "/dashboard", label: "Overview", Icon: HomeIcon },
  { href: "/dashboard/payments", label: "Payments", Icon: ReceiptIcon },
  { href: "/dashboard/developers", label: "Developers", Icon: CodeIcon },
  { href: "/dashboard/account", label: "Account", Icon: UserIcon },
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * The signed-in dashboard: a sidebar on large screens (account, then one link per job) and a scrolling tab bar on
 * phones. Pages render their own heading.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { address, method, businessName } = useMerchant();
  const { copied, copy } = useCopy();
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  const account = (
    <div className="min-w-0 space-y-2">
      <p className="truncate font-semibold text-stone-900" title={businessName ?? undefined}>
        {businessName ?? "Your business"}
      </p>
      <button
        onClick={() => copy(address)}
        className="group flex w-full items-center gap-2 rounded-md text-left text-xs text-stone-500 hover:text-stone-900"
        aria-label={`Copy payout address ${address}`}
      >
        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-700">{method === "passkey" ? "Passkey" : "Wallet"}</span>
        <span className="font-mono">{copied ? "Copied" : short(address)}</span>
        {copied ? <CheckIcon className="h-3.5 w-3.5 text-green-700" /> : <CopyIcon className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />}
      </button>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
      {/* Large screens: sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-6">
          {account}
          <nav aria-label="Dashboard">
            <ul className="space-y-0.5">
              {TABS.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active ? "bg-white font-medium text-stone-900 shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                      }`}
                    >
                      <Icon className={`h-[18px] w-[18px] ${active ? "text-stone-900" : "text-stone-400"}`} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <Link href="/docs" className="flex items-center gap-2 px-3 text-xs text-stone-500 hover:text-stone-900">
            API reference <ExternalIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </aside>

      {/* Phones and tablets: account line and a tab bar */}
      <div className="mb-6 space-y-4 lg:hidden">
        {account}
        <nav aria-label="Dashboard" className="-mx-4 overflow-x-auto border-b border-stone-200 px-4">
          <ul className="flex gap-1">
            {TABS.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`-mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${
                      active ? "border-stone-900 font-medium text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
