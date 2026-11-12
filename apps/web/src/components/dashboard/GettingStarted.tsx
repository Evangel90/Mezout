"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightIcon, CheckIcon, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useMerchant } from "@/lib/merchant";
import type { Order } from "@/lib/useOrders";

const DISMISSED = "mezout:getting-started-dismissed";

type Step = { done: boolean; title: string; body: string; target?: string; href?: string };

/**
 * A short setup checklist for new merchants: name the business, make a link, get paid, then optionally connect a
 * store. It hides itself once everything is done, or when dismissed.
 */
export function GettingStarted({ orders }: { orders: Order[] | null }) {
  const { businessName, address } = useMerchant();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  // null until localStorage has been read, so nothing flashes for merchants who hid the checklist.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(`${DISMISSED}:${address}`) === "1");
    } catch {
      setDismissed(false);
    }
  }, [address]);

  useEffect(() => {
    if (dismissed !== false) return;
    api<{ data: unknown[] }>("/api/keys")
      .then((r) => setHasKey(r.data.length > 0))
      .catch(() => setHasKey(false));
  }, [dismissed]);

  if (dismissed !== false) return null;
  // Hold the checklist's space while its data loads, so the page below doesn't jump when it appears.
  if (orders === null || hasKey === null) return <ChecklistSkeleton />;

  const paid = orders.some((o) => o.status === "paid" || o.status === "refunded");
  const steps: Step[] = [
    { done: !!businessName, title: "Name your business", body: "Customers see it when they pay.", target: "business-name" },
    { done: orders.length > 0, title: "Create a payment link", body: "Pick an amount. You see the fee first.", target: "new-link" },
    { done: paid, title: "Get your first payment", body: "Share the link or QR code, or try paying it yourself.", target: "new-link" },
    {
      done: hasKey,
      title: "Connect your store",
      body: "Optional. Shopify, WooCommerce or your own server.",
      href: "/guides",
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) {
    remember(address);
    return null;
  }
  const nextIndex = steps.findIndex((s) => !s.done);

  const dismiss = () => {
    setDismissed(true);
    remember(address);
  };


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
          const cardClass = `group flex h-full w-full gap-3 rounded-lg border p-3.5 text-left transition-colors ${
            s.done
              ? "border-stone-100 bg-stone-50"
              : next
                ? "border-ink ring-1 ring-ink hover:bg-stone-50"
                : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"
          }`;
          const body = (
            <>
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done ? "bg-musd-500 text-white" : next ? "bg-ink text-white" : "border border-stone-300 text-stone-600"
                }`}
              >
                {s.done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className={`block text-sm font-medium ${s.done ? "text-stone-500 line-through decoration-stone-300" : "text-stone-900"}`}>
                  {s.title}
                  <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                </span>
                {!s.done && <span className="block text-[13px] leading-snug text-stone-600">{s.body}</span>}
              </span>
              {!s.done && (
                <ArrowRightIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
              )}
            </>
          );
          return (
            <li key={s.title} aria-current={next ? "step" : undefined}>
              {s.done ? (
                <div className={cardClass}>{body}</div>
              ) : s.href ? (
                <Link href={s.href} className={cardClass}>
                  {body}
                </Link>
              ) : (
                <button type="button" onClick={() => goTo(s.target!)} className={cardClass}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Scrolls to a form on the page and puts the cursor in its first field. */
function goTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const form = el.closest("form") ?? el;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  const field = form.querySelector<HTMLElement>("input:not([type=hidden]):not([readonly]), select, textarea, button");
  window.setTimeout(() => field?.focus({ preventScroll: true }), 350);
}

/** Hides the checklist on later visits, once it has been dismissed or finished. */
function remember(address: string) {
  try {
    localStorage.setItem(`${DISMISSED}:${address}`, "1");
  } catch {
    // Private browsing: the checklist just comes back next visit.
  }
}

function ChecklistSkeleton() {
  return (
    <div aria-hidden className="rounded-xl border border-stone-200/90 bg-white p-5 shadow-card sm:p-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-3.5 w-16" />
      <Skeleton className="mt-4 h-1.5 w-full" />
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[7.5rem] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
