"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#developers", label: "Developers" },
  { href: "/docs", label: "Docs" },
  { href: "/dashboard", label: "Dashboard" },
];

/** Header links in a pill, with the current section marked. Hidden on phones, where the header shows Docs alone. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <div className="hidden items-center gap-0.5 rounded-full border border-stone-200 bg-white p-1 text-sm shadow-sm md:flex">
      {LINKS.map((l) => {
        const active = !l.href.includes("#") && (pathname === l.href || pathname.startsWith(`${l.href}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 transition-colors ${
              active ? "bg-stone-100 font-medium text-stone-900" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
