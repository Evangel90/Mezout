"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { useMerchant } from "@/lib/merchant";
import type { Order } from "@/lib/useOrders";

const DISMISSED = "mezout:getting-started-dismissed";

/** A short setup checklist for new merchants. It hides itself once everything is done, or when dismissed. */
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

  const steps = [
    { done: !!businessName, title: "Add your business name", body: "Customers see it at checkout.", href: "#business-name", cta: "Add name" },
    { done: orders.length > 0, title: "Create your first payment link", body: "Share it or show the QR code to get paid.", href: "#new-link", cta: "Create link" },
    {
      done: hasKey,
      title: "Connect your store",
      body: "Optional: create an API key for your server, WooCommerce or Shopify.",
      href: "/dashboard/developers",
      cta: "Open Developers",
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  if (remaining === 0) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(`${DISMISSED}:${address}`, "1");
    } catch {
      // Private browsing: the checklist just comes back next visit.
    }
  };

  return (
    <section aria-labelledby="getting-started" className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-900/[0.03]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="getting-started" className="text-base font-semibold">
          Get set up
        </h2>
        <p className="text-xs text-stone-500">
          {steps.length - remaining} of {steps.length} done ·{" "}
          <button onClick={dismiss} className="underline underline-offset-2 hover:text-stone-900">
            Dismiss
          </button>
        </p>
      </div>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex gap-3 rounded-lg border p-3 ${s.done ? "border-stone-100 bg-stone-50" : "border-stone-200"}`}>
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                s.done ? "bg-green-600 text-white" : "border border-stone-300 text-stone-600"
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
                  <p className="text-xs text-stone-600">{s.body}</p>
                  {s.href.startsWith("#") ? (
                    <a href={s.href} className="inline-block text-xs font-medium text-stone-900 underline underline-offset-2">
                      {s.cta}
                    </a>
                  ) : (
                    <Link href={s.href} className="inline-block text-xs font-medium text-stone-900 underline underline-offset-2">
                      {s.cta}
                    </Link>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
