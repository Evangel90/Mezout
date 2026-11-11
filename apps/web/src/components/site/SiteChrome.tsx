"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/site/Logo";
import { SiteNav } from "@/components/site/SiteNav";

const REPO = "https://github.com/Evangel90/Mezout";

/** Customers on a payment link see a quiet header with no marketing links; everyone else sees the site navigation. */
const isCheckout = (pathname: string) => pathname.startsWith("/pay/");

export function SiteHeader() {
  const pathname = usePathname();

  if (isCheckout(pathname)) {
    return (
      <header className="border-b border-stone-200/80 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <LogoMark className="h-5 w-5 text-stone-900" />
            Mezout
          </span>
          <span className="flex items-center gap-2 text-xs text-stone-500">
            <LockIcon />
            Secure checkout
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">Testnet</span>
          </span>
        </div>
      </header>
    );
  }

  const inDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/85 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <LogoMark className="h-6 w-6 text-stone-900" />
          Mezout
        </Link>
        <SiteNav />
        <div className="flex items-center gap-3 text-sm">
          <Link href="/docs" className="text-stone-600 hover:text-stone-900 md:hidden">
            Docs
          </Link>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Testnet</span>
          {!inDashboard && (
            <Link href="/dashboard" className="rounded-full bg-stone-900 px-4 py-1.5 font-medium text-white hover:bg-stone-700">
              <span className="sm:hidden">Sign in</span>
              <span className="hidden sm:inline">Get started</span>
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();

  if (isCheckout(pathname)) {
    return (
      <footer className="border-t border-stone-200 bg-white">
        <p className="mx-auto max-w-5xl px-4 py-5 text-center text-xs text-stone-500">
          Payments settle on Mezo through a verified contract. Mezout never holds your funds.{" "}
          <Link href="/" className="underline hover:text-stone-900">
            About Mezout
          </Link>
        </p>
      </footer>
    );
  }

  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-stone-600 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm space-y-2">
          <p className="flex items-center gap-2 font-medium text-stone-900">
            <LogoMark className="h-5 w-5 text-stone-900" /> Mezout
          </p>
          <p className="text-xs leading-relaxed">
            Merchant checkout on Mezo. Running on Mezo testnet with test tokens that have no real value. Mezout never
            holds merchant or customer funds.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-x-10 gap-y-2">
          <li>
            <Link href="/dashboard" className="hover:text-stone-900">
              Dashboard
            </Link>
          </li>
          <li>
            <Link href="/docs" className="hover:text-stone-900">
              API reference
            </Link>
          </li>
          <li>
            <a href="/#contracts" className="hover:text-stone-900">
              Contracts
            </a>
          </li>
          <li>
            <a href={REPO} className="hover:text-stone-900">
              Source code
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}
