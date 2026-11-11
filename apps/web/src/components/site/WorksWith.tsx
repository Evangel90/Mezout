import Link from "next/link";
import { BRAND_PATHS, type BrandIcon } from "./brandPaths";

const PLUGINS = "https://github.com/Evangel90/Mezout/tree/main/plugins";

type Brand = { name: string; icon?: BrandIcon; href: string; note: string };

/** Stores Mezout ships a plugin for. */
export const STORE_BRANDS: Brand[] = [
  { name: "Shopify", icon: "shopify", href: `${PLUGINS}/shopify`, note: "Mezout app for Shopify stores" },
  { name: "WooCommerce", icon: "woocommerce", href: `${PLUGINS}/woocommerce`, note: "Mezout plugin for WooCommerce" },
];

/** MCP clients that can run the local `npx -y @mezout/mcp` server. Codex and Hermes Agent are text wordmarks. */
export const AGENT_BRANDS: Brand[] = [
  { name: "Claude", icon: "claude", href: "/docs#ai-agents", note: "Claude Code and Claude Desktop" },
  { name: "Codex", href: "/docs#ai-agents", note: "Codex CLI, IDE extension and ChatGPT desktop" },
  { name: "Cursor", icon: "cursor", href: "/docs#ai-agents", note: "Cursor" },
  { name: "Hermes Agent", href: "/docs#ai-agents", note: "Hermes Agent by Nous Research" },
];

// The WooCommerce mark is a wide lockup inside simple-icons' square viewBox, so it is cropped to its own bounds
// (measured with getBBox) and drawn wider rather than shrunk.
const WIDE: Partial<Record<BrandIcon, { viewBox: string; className: string }>> = {
  woocommerce: { viewBox: "0 9.58 24 4.84", className: "h-[1.05rem] w-auto" },
};

export function BrandMark({ icon, className = "h-5 w-5" }: { icon: BrandIcon; className?: string }) {
  const wide = WIDE[icon];
  return (
    <svg viewBox={wide?.viewBox ?? "0 0 24 24"} className={`shrink-0 ${wide ? wide.className : className}`} fill="currentColor" aria-hidden>
      <path d={BRAND_PATHS[icon]} />
    </svg>
  );
}

function BrandLink({ brand, dark, size }: { brand: Brand; dark: boolean; size: "md" | "lg" }) {
  const cls = `group inline-flex items-center gap-2.5 rounded-lg px-2 py-1.5 font-semibold tracking-tight transition-colors ${
    size === "lg" ? "text-lg" : "text-[15px]"
  } ${dark ? "text-stone-400 hover:text-white" : "text-stone-500 hover:text-ink"}`;
  const inner = (
    <>
      {brand.icon && <BrandMark icon={brand.icon} className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} />}
      <span>{brand.name}</span>
    </>
  );
  return brand.href.startsWith("http") ? (
    <a href={brand.href} title={brand.note} className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={brand.href} title={brand.note} className={cls}>
      {inner}
    </Link>
  );
}

/** A labelled row of "works with" marks. Compatibility only: none of these brands endorse or partner with Mezout. */
export function BrandRow({ label, brands, dark = false, size = "md", center = false }: { label: string; brands: Brand[]; dark?: boolean; size?: "md" | "lg"; center?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${center ? "sm:justify-center" : ""}`}>
      <p className={`eyebrow shrink-0 ${dark ? "text-stone-500" : "text-stone-500"}`}>{label}</p>
      <ul className={`-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${center ? "sm:justify-center" : ""}`}>
        {brands.map((b) => (
          <li key={b.name}>
            <BrandLink brand={b} dark={dark} size={size} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The strip under the hero: stores and agents Mezout works with. */
export function WorksWithStrip() {
  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1px_auto] lg:items-center lg:justify-center lg:gap-10">
      <BrandRow label="Works with stores" brands={STORE_BRANDS} size="lg" />
      <span aria-hidden className="hidden h-8 w-px bg-stone-200 lg:block" />
      <BrandRow label="Agents via MCP" brands={AGENT_BRANDS} size="lg" />
    </div>
  );
}
