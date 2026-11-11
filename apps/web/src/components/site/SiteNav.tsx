"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const NAV_LINKS = [
  { href: "/#humans", label: "Checkout", section: "humans" },
  { href: "/#agents", label: "AI agents", section: "agents" },
  { href: "/guides", label: "Guides" },
  { href: "/docs", label: "Docs" },
];

const isPage = (pathname: string, href: string) => !href.includes("#") && (pathname === href || pathname.startsWith(`${href}/`));

/** On the landing page, the section in the middle of the viewport (for the nav's visual indicator only). */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return setActive(null);
    const ids = NAV_LINKS.flatMap((l) => (l.section ? [l.section] : []));
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
          else setActive((cur) => (cur === e.target.id ? null : cur));
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [enabled]);
  return active;
}

/** Header links on large screens: a quiet row with a pill under the hovered or current item. */
export function SiteNav({ dark }: { dark: boolean }) {
  const pathname = usePathname();
  const section = useActiveSection(pathname === "/");
  return (
    <ul className={`hidden items-center gap-0.5 rounded-full p-1 text-[15px] transition-colors md:flex ${dark ? "bg-white/[0.04] ring-1 ring-inset ring-white/10" : "bg-stone-100/70 ring-1 ring-inset ring-stone-200/70"}`}>
      {NAV_LINKS.map((l) => {
        const page = isPage(pathname, l.href);
        const current = page || (!!l.section && section === l.section);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={page ? "page" : undefined}
              className={`relative block rounded-full px-4 py-1.5 transition-colors ${
                dark
                  ? current
                    ? "bg-white/10 text-white"
                    : "text-stone-300 hover:bg-white/[0.07] hover:text-white"
                  : current
                    ? "bg-white font-medium text-ink shadow-card"
                    : "text-stone-600 hover:bg-white/70 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The phone menu: a button that opens a full-width sheet under the header. While open, focus stays inside the sheet,
 * Escape closes it, the page behind doesn't scroll, and focus returns to the button on close.
 */
export function MobileMenu({ dark, onOpenChange }: { dark: boolean; onOpenChange?: (open: boolean) => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const sheet = panel.current;
    const items = () => Array.from(sheet?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
      if (e.key === "Tab") {
        // Cycle between the menu button and the sheet's links.
        const list = [button.current, ...items()].filter((x): x is HTMLElement => !!x);
        const i = list.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          list[list.length - 1].focus();
        } else if (!e.shiftKey && i === list.length - 1) {
          e.preventDefault();
          list[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          dark ? "text-white hover:bg-white/10" : "text-ink hover:bg-stone-100"
        }`}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d={open ? "M6 6l12 12" : "M4 9h16"} className="transition-all" />
          <path d={open ? "M18 6L6 18" : "M4 15h16"} className="transition-all" />
        </svg>
      </button>
      {/* Portalled to <body>: the header's backdrop blur would otherwise trap this fixed sheet inside the header. */}
      {open &&
        createPortal(
        <nav
          id={panelId}
          ref={panel}
          aria-label="Menu"
          className="fixed inset-x-0 bottom-0 top-[4.5rem] z-50 flex flex-col overflow-y-auto border-t border-stone-200 bg-white px-4 pb-8 pt-2 slide-in md:hidden"
        >
          <ul className="divide-y divide-stone-100">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={close}
                  aria-current={isPage(pathname, l.href) ? "page" : undefined}
                  className="flex items-center justify-between py-4 text-2xl font-semibold tracking-[-0.03em] text-ink"
                >
                  {l.label}
                  <span aria-hidden className="text-lg text-stone-400">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-auto space-y-3 pt-8">
            <Link href="/dashboard" onClick={close} className="pill-ink w-full">
              Get started
            </Link>
            <Link href="/dashboard" onClick={close} className="pill-outline w-full">
              Sign in
            </Link>
            <p className="pt-2 text-center text-xs text-stone-500">Mezo testnet. Test tokens have no real value.</p>
          </div>
        </nav>,
          document.body,
        )}
    </div>
  );
}
