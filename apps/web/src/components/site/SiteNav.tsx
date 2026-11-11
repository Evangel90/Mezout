"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

export const NAV_LINKS = [
  { href: "/#humans", label: "Checkout" },
  { href: "/#agents", label: "AI agents" },
  { href: "/#developers", label: "Developers" },
  { href: "/docs", label: "Docs" },
];

const isActive = (pathname: string, href: string) => !href.includes("#") && (pathname === href || pathname.startsWith(`${href}/`));

/** Header links on large screens, with the current page marked. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <ul className="hidden items-center gap-1 text-[15px] md:flex">
      {NAV_LINKS.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-2 transition-colors ${active ? "font-medium text-ink" : "text-stone-600 hover:bg-stone-100 hover:text-ink"}`}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The phone menu: a button that opens the same links as a panel under the header. */
export function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-stone-100"
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
        </svg>
      </button>
      {open && (
        <div id={panelId} className="absolute inset-x-0 top-full border-b border-stone-200 bg-white px-4 pb-6 pt-2 shadow-lift">
          <ul className="divide-y divide-stone-100">
            {[...NAV_LINKS, { href: "/dashboard", label: "Sign in" }].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(pathname, l.href) ? "page" : undefined}
                  className="flex items-center justify-between py-3.5 text-lg font-medium tracking-tight text-ink"
                >
                  {l.label}
                  <span aria-hidden className="text-stone-400">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/dashboard" onClick={() => setOpen(false)} className="pill-ink mt-4 w-full">
            Start accepting payments
          </Link>
        </div>
      )}
    </div>
  );
}
