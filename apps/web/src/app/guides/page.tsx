import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "./guides";

export const metadata: Metadata = {
  title: "Guides",
  description: "Step-by-step guides for taking Mezout payments in Shopify, WooCommerce, your own site and from AI agents.",
};

const GROUPS = Array.from(new Set(GUIDES.map((g) => g.group)));

export default function GuidesIndex() {
  return (
    <div>
      <header className="border-b border-stone-200 bg-canvas">
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-12 sm:px-6 sm:py-16">
          <p className="eyebrow text-signal-700">Guides</p>
          <h1 className="display-2">Start taking payments.</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-stone-600">
            Pick where you sell. Each guide takes you from zero to your first test payment.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-12 px-4 py-12 sm:px-6 sm:py-16">
        {GROUPS.map((group) => (
          <section key={group} aria-labelledby={`group-${group}`} className="space-y-4">
            <h2 id={`group-${group}`} className="eyebrow text-stone-500">
              {group}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {GUIDES.filter((g) => g.group === group).map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/guides/${g.slug}`}
                    className="group flex h-full flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    <span className="flex items-center justify-between text-lg font-semibold tracking-tight text-ink">
                      {g.title}
                      <span aria-hidden className="text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
                        →
                      </span>
                    </span>
                    <span className="text-[15px] leading-relaxed text-stone-600">{g.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="flex flex-col justify-between gap-5 rounded-3xl bg-canvas p-7 sm:flex-row sm:items-center sm:p-8">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Building your own integration?</h2>
            <p className="text-stone-600">The API reference covers payment links, webhooks and refunds.</p>
          </div>
          <Link href="/docs" className="pill-ink shrink-0">
            API reference
          </Link>
        </section>
      </div>
    </div>
  );
}
