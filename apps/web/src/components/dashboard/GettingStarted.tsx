"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightIcon, CheckIcon, ExternalLink } from "@/components/ui";
import { api } from "@/lib/api";
import { useMerchant } from "@/lib/merchant";
import type { Order } from "@/lib/useOrders";

const DISMISSED = "mezout:getting-started-dismissed";

type Step = { done: boolean; title: string; body: string; href: string; cta: string; external?: boolean };

/**
 * A short setup checklist for new merchants: name the business, make a link, get paid, then optionally connect a
 * store. It hides itself once everything is done, or when dismissed.
 */
export function GettingStarted({ orders }: { orders: Order[] | null }) {
  const { businessName, address } = useMerchant();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(`${DISMISSED}:${address}`) === "1");
    } catch {
      setDismissed(false);
    }
  }, [address]);

  useEffect(() => {
    if (dismissed) return;
    api<{ data: unknown[] }>("/api/keys")
      .then((r) => setHasKey(r.data.length > 0))
      .catch(() => setHasKey(false));
  }, [dismissed]);

  if (orders === null || hasKey === null || dismissed) return null;

  const paid = orders.some((o) => o.status === "paid" || o.status === "refunded");
  const steps: Step[] = [
    { done: !!businessName, title: "Name your business", body: "Customers see it when they pay.", href: "#business-name", cta: "Add name" },
    { done: orders.length > 0, title: "Create a payment link", body: "Pick an amount. You see the fee first.", href: "#new-link", cta: "Create link" },
    { done: paid, title: "Get your first payment", body: "Share the link or QR code. Try it yourself on testnet.", href: "#new-link", cta: "Share a link" },
    {
      done: hasKey,
      title: "Connect your store",
      body: "Optional. Shopify, WooCommerce or your own server.",
      href: "/guides",
      cta: "Pick a guide",
      external: true,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const nextIndex = steps.findIndex((s) => !s.done);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(`${DISMISSED}:${address}`, "1");
    } catch {
      // Private browsing: the checklist just comes back next visit.
    }
  };

  const ctaClass = "inline-flex min-h-[32px] items-center gap-1 text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-ink";

  return (
    <section aria-labelledby="getting-started" className="rounded-xl border border-stone-200/90 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h2 id="getting-started" className="text-[15px] font-semibold tracking-tight">
            Get set up
          </h2>
          <p className="text-sm text-stone-600">
            {done} of {steps.length} done
          </p>
        </div>
        <button onClick={dismiss} className="min-h-[40px] rounded-lg px-2 text-sm text-stone-500 underline underline-offset-2 hover:text-stone-900">
          Hide checklist
        </button>
      </div>
      <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-musd-500 transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => {
          const next = i === nextIndex;
          return (
            <li
              key={s.title}
              aria-current={next ? "step" : undefined}
              className={`flex gap-3 rounded-lg border p-3.5 ${s.done ? "border-stone-100 bg-stone-50" : next ? "border-ink ring-1 ring-ink" : "border-stone-200"}`}
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done ? "bg-musd-500 text-white" : next ? "bg-ink text-white" : "border border-stone-300 text-stone-600"
                }`}
              >
                {s.done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 space-y-1">
                <p className={`text-sm font-medium ${s.done ? "text-stone-500 line-through decoration-stone-300" : "text-stone-900"}`}>
                  {s.title}
                  <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                </p>
                {!s.done && (
                  <>
                    <p className="text-[13px] leading-snug text-stone-600">{s.body}</p>
                    {s.external ? (
                      <span className="flex flex-wrap gap-x-3">
                        <ExternalLink href={s.href} className={ctaClass}>
                          {s.cta}
                        </ExternalLink>
                        <Link href="/dashboard/developers" className={ctaClass}>
                          API keys
                        </Link>
                      </span>
                    ) : (
                      <a href={s.href} className={ctaClass}>
                        {s.cta}
                        <ArrowRightIcon className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
