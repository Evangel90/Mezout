"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  ExternalIcon,
  ExternalLink,
  HomeIcon,
  ReceiptIcon,
  ToastProvider,
  UserIcon,
  useCopy,
} from "@/components/ui";
import { useMerchant } from "@/lib/merchant";

const TABS = [
  { href: "/dashboard", label: "Overview", Icon: HomeIcon },
  { href: "/dashboard/payments", label: "Payments", Icon: ReceiptIcon },
  { href: "/dashboard/developers", label: "Developers", Icon: CodeIcon },
  { href: "/dashboard/account", label: "Account", Icon: UserIcon },
];

/** Help that lives outside the dashboard, so it opens in a new tab and the merchant keeps their place. */
const HELP = [
  { href: "/guides", label: "Setup guides", Icon: BookIcon },
  { href: "/docs", label: "API reference", Icon: CodeIcon },
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * The signed-in dashboard, in an admin layout: a grey sidebar on large screens (the business, then one link per job,
 * then help) beside a light canvas of white cards, and a scrolling tab bar on phones. Pages render their own heading.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { address, method, businessName } = useMerchant();
  const { copied, copy } = useCopy();
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));
  const initial = (businessName ?? "M").trim().charAt(0).toUpperCase();

  const account = (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-musd-500 text-sm font-semibold text-white">
        {initial}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-stone-900" title={businessName ?? undefined}>
          {businessName ?? "Your business"}
        </p>
        <button
          onClick={() => copy(address)}
          className="group -my-1 flex min-h-[28px] items-center gap-1.5 rounded text-left text-xs text-stone-500 hover:text-stone-900"
          aria-label={`Copy payout address ${address}`}
        >
          <span className="font-medium text-stone-600">{method === "passkey" ? "Passkey" : "Wallet"}</span>
          <span className="whitespace-nowrap font-mono" aria-live="polite">
            {copied ? "Copied" : short(address)}
          </span>
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5 text-musd-700" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 lg:opacity-0 lg:group-focus-visible:opacity-100" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="flex-1 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Large screens: sidebar */}
        <aside className="hidden border-r border-stone-200 bg-stone-100 lg:block">
          <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col gap-6 px-3 py-5">
            <div className="px-2">{account}</div>
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
                          active ? "bg-white font-semibold text-stone-900 shadow-card" : "text-stone-700 hover:bg-stone-200/70 hover:text-stone-900"
                        }`}
                      >
                        <Icon className={`h-[18px] w-[18px] ${active ? "text-stone-900" : "text-stone-500"}`} />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-auto space-y-3">
              <div>
                <p className="px-3 pb-1 text-xs font-medium text-stone-500">Help</p>
                <ul className="space-y-0.5">
                  {HELP.map(({ href, label, Icon }) => (
                    <li key={href}>
                      <ExternalLink
                        href={href}
                        icon={false}
                        className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-200/70 hover:text-stone-900"
                      >
                        <Icon className="h-[18px] w-[18px] text-stone-500" />
                        <span className="flex-1">{label}</span>
                        <ExternalIcon className="h-3.5 w-3.5 text-stone-400 group-hover:text-stone-700" />
                      </ExternalLink>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </aside>

        {/* Phones and tablets: account line and a tab bar */}
        <div className="border-b border-stone-200 bg-white lg:hidden">
          <div className="px-4 pt-4">{account}</div>
          <nav aria-label="Dashboard" className="mt-2 overflow-x-auto px-2">
            <ul className="flex gap-1">
              {TABS.map(({ href, label }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`-mb-px flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-sm ${
                        active ? "border-ink font-semibold text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"
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

        <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</div>
      </div>
    </ToastProvider>
  );
}
