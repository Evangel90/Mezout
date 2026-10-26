"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/dashboard", label: "Dashboard" },
];

/** Header links, with the current section marked. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={active ? "font-medium text-stone-900" : "text-stone-600 hover:text-stone-900"}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
