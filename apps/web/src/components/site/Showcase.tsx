"use client";

import { useEffect, useRef, useState } from "react";

/** One tab per animation in public/motion; `dur` is the scene's loop length in seconds (see docs/motion). */
const TABS = [
  {
    label: "Pay any way",
    title: "They choose. You get MUSD.",
    body: "MUSD, BTC, MEZO, or a loan against their Bitcoin. They pay your price. You get MUSD.",
    src: "/motion/01-pay-any-way.svg",
    dur: 8,
  },
  {
    label: "Borrow against BTC",
    title: "Spend Bitcoin without selling it.",
    body: "Customers borrow MUSD against their BTC as they pay. Checkout refuses any loan below 160% collateral.",
    src: "/motion/02-borrow-dont-sell.svg",
    dur: 10,
  },
  {
    label: "Gasless",
    title: "They sign. Mezout pays the gas.",
    body: "Mezout covers the network fee, so customers with Ethereum-style wallets never need a gas token.",
    src: "/motion/04-gasless.svg",
    dur: 8,
  },
  {
    label: "Passkey accounts",
    title: "No wallet needed to get paid.",
    body: "Sign up with Face ID, Touch ID or your phone. Only your passkey controls your payout account. Withdrawals are free.",
    src: "/motion/03-passkey-merchant.svg",
    dur: 9,
  },
  {
    label: "Integrations",
    title: "Works with how you sell.",
    body: "Share a link or QR code, install the Shopify app or WooCommerce plugin, or use the API. Your store hears the moment an order is paid.",
    src: "/motion/05-plug-in.svg",
    dur: 9,
  },
];

/**
 * Tabbed walkthrough of the animations. While on screen it advances after each scene's loop; choosing a tab stops
 * that. Each switch loads the scene under a fresh URL so its animation starts from the beginning.
 */
export function Showcase() {
  const [active, setActive] = useState(0);
  const [run, setRun] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !visible) return;
    const t = setTimeout(() => {
      setActive((a) => (a + 1) % TABS.length);
      setRun((r) => r + 1);
    }, TABS[active].dur * 1000);
    return () => clearTimeout(t);
  }, [auto, visible, active, run]);

  const choose = (i: number) => {
    setAuto(false);
    setActive(i);
    setRun((r) => r + 1);
  };
  const tab = TABS[active];

  return (
    <div ref={ref} className="space-y-8">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="How Mezout works" className="mx-auto flex w-max gap-1 rounded-full border border-stone-200 bg-white p-1 shadow-card">
          {TABS.map((t, i) => (
            <button
              key={t.label}
              role="tab"
              aria-selected={i === active}
              onClick={() => choose(i)}
              className={`relative overflow-hidden whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors ${
                i === active ? "bg-ink font-medium text-white" : "text-stone-600 hover:bg-stone-100 hover:text-ink"
              }`}
            >
              {t.label}
              {i === active && auto && visible && (
                <span
                  key={run}
                  aria-hidden
                  className="tab-progress absolute inset-x-4 bottom-1 h-0.5 origin-left rounded-full bg-signal-400"
                  style={{ animationDuration: `${t.dur}s` }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-2 text-center" aria-live="polite">
        <h3 className="display-3">{tab.title}</h3>
        <p className="text-lg leading-relaxed text-stone-600">{tab.body}</p>
      </div>

      <div className="rounded-4xl border border-stone-200 bg-white p-2 shadow-card">
        <div className="overflow-x-auto rounded-3xl bg-canvas">
          <div className="aspect-[1120/440] min-w-[680px] p-4 sm:p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={run} src={`${tab.src}?run=${run}`} alt={`${tab.title} ${tab.body}`} className="h-full w-full object-contain" />
          </div>
        </div>
      </div>
      <p className="-mt-5 text-center text-xs text-stone-500 sm:hidden">Swipe the animation to see the whole flow.</p>
    </div>
  );
}
