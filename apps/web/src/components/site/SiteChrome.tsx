"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/site/Logo";
import { MobileMenu, SiteNav } from "@/components/site/SiteNav";

const REPO = "https://github.com/Evangel90/Mezout";

/**
 * Checkout and the dashboard draw their own frame (a store header, an admin top bar), so the marketing header and
 * footer only appear on the site's other pages.
 */
const ownFrame = (pathname: string) => pathname.startsWith("/pay/") || pathname === "/dashboard" || pathname.startsWith("/dashboard/");

export function SiteHeader() {
  const pathname = usePathname();
  if (ownFrame(pathname)) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
      <nav aria-label="Main" className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Mezout home" className="rounded-lg">
            <Wordmark />
          </Link>
          <SiteNav />
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-signal-200 bg-signal-50 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wider text-signal-800 sm:inline">
            Testnet
          </span>
          <Link href="/dashboard" className="hidden rounded-full px-3.5 py-2 text-[15px] text-stone-700 hover:bg-stone-100 hover:text-ink md:inline">
            Sign in
          </Link>
          <Link href="/dashboard" className="pill-ink hidden px-5 py-2.5 text-sm sm:inline-flex">
            Get started
          </Link>
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}

const FOOTER = [
  {
    title: "Product",
    links: [
      { href: "/#humans", label: "Checkout" },
      { href: "/#agents", label: "AI agents" },
      { href: "/#merchants", label: "Settlement" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "API reference" },
      { href: "/docs#ai-agents", label: "MCP server" },
      { href: `${REPO}/tree/main/packages/paywall`, label: "HTTP 402 paywall" },
      { href: `${REPO}/tree/main/plugins`, label: "Plugins" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/#contracts", label: "Verified contracts" },
      { href: REPO, label: "Source code" },
    ],
  },
];

export function SiteFooter() {
  const pathname = usePathname();
  if (ownFrame(pathname)) return null;

  return (
    <footer className="on-dark bg-ink text-stone-400">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-10 pt-16 sm:px-6 lg:grid-cols-[1.2fr_2fr]">
        <div className="max-w-sm space-y-4">
          <Wordmark dark />
          <p className="text-sm leading-relaxed">
            Checkout for humans and AI agents on Mezo. Running on Mezo testnet with test tokens that have no real value.
            Mezout never holds merchant or customer funds.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {FOOTER.map((col) => (
            <div key={col.title} className="space-y-3">
              <p className="eyebrow text-stone-500">{col.title}</p>
              <ul className="space-y-2 text-[15px]">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("http") ? (
                      <a href={l.href} className="text-stone-300 hover:text-white">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-stone-300 hover:text-white">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-6 text-xs sm:px-6">
        <p>Mezout · Mezo testnet (chain 31611)</p>
        <p>Open source. Contracts verified on Sourcify.</p>
      </div>
    </footer>
  );
}
