"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/site/Logo";
import { MobileMenu, SiteNav } from "@/components/site/SiteNav";

const REPO = "https://github.com/Evangel90/Mezout";

/**
 * Checkout and the dashboard draw their own frame (a store header, an admin top bar), so the marketing header and
 * footer only appear on the site's other pages.
 */
const ownFrame = (pathname: string) => pathname.startsWith("/pay/") || pathname === "/dashboard" || pathname.startsWith("/dashboard/");

const HEADER_PX = 72;

/**
 * Header state from scroll: `dark` while the landing page's dark hero is behind the header, `scrolled` once the page
 * has moved. Read in a passive, rAF-throttled scroll listener; React only re-renders when a value flips.
 */
function useHeaderState(pathname: string) {
  const [state, setState] = useState({ dark: pathname === "/", scrolled: false });
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const hero = pathname === "/" ? document.getElementById("hero") : null;
      const dark = !!hero && hero.getBoundingClientRect().bottom > HEADER_PX;
      const scrolled = window.scrollY > 4;
      setState((s) => (s.dark === dark && s.scrolled === scrolled ? s : { dark, scrolled }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);
  return state;
}

export function SiteHeader() {
  const pathname = usePathname();
  const header = useHeaderState(pathname);
  // With the phone menu open, the header turns light to sit on the menu's white sheet.
  const [menuOpen, setMenuOpen] = useState(false);
  const dark = header.dark && !menuOpen;
  const scrolled = header.scrolled || menuOpen;
  if (ownFrame(pathname)) return null;

  const surface = menuOpen
    ? "border-stone-200 bg-white"
    : dark
    ? scrolled
      ? "on-dark border-white/10 bg-ink/70 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.6)] backdrop-blur-xl backdrop-saturate-150"
      : "on-dark border-transparent bg-transparent"
    : scrolled
      ? "border-stone-200/80 bg-white/80 shadow-[0_8px_30px_-16px_rgb(12_10_9/0.18)] backdrop-blur-xl backdrop-saturate-150"
      : "border-transparent bg-white/80 backdrop-blur-xl";

  return (
    <header className={`sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300 ${surface}`}>
      <nav aria-label="Main" className="relative mx-auto grid h-[4.5rem] max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Mezout home" className="rounded-lg">
            <Wordmark dark={dark} />
          </Link>
        </div>
        <SiteNav dark={dark} />
        <div className="flex items-center justify-end gap-1.5">
          <Link
            href="/dashboard"
            className={`hidden rounded-full px-4 py-2 text-[15px] font-medium transition-colors lg:inline ${
              dark ? "text-stone-200 hover:bg-white/10 hover:text-white" : "text-stone-700 hover:bg-stone-100 hover:text-ink"
            }`}
          >
            Sign in
          </Link>
          <Link href="/dashboard" className={`${dark ? "pill-signal" : "pill-ink"} hidden px-5 py-2.5 text-sm sm:inline-flex`}>
            Get started <span aria-hidden>→</span>
          </Link>
          <MobileMenu dark={dark} onOpenChange={setMenuOpen} />
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
      { href: "/#merchants", label: "Why Mezout" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/guides/shopify", label: "Shopify" },
      { href: "/guides/woocommerce", label: "WooCommerce" },
      { href: "/guides/embedded-checkout", label: "Embedded checkout" },
      { href: "/guides/ai-agents", label: "AI agents" },
      { href: "/guides/paywall", label: "Charge per request" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "API reference" },
      { href: "/docs#webhooks", label: "Webhooks" },
      { href: "/docs#ai-agents", label: "MCP server" },
      { href: "/#contracts", label: "Verified contracts" },
      { href: REPO, label: "View on GitHub" },
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
            Get paid by people and AI agents, in MUSD. Mezout never holds your funds.
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
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-white">
                        {l.label}
                        <span className="sr-only"> (opens in a new tab)</span>
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
