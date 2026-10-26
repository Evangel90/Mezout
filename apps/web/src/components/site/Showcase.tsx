"use client";

import { useEffect, useRef, useState } from "react";

/** One tab per animation in public/motion; `dur` is the scene's loop length in seconds (see docs/motion). */
const TABS = [
  {
    label: "Pay any way",
    title: "Customers choose. You get exact MUSD.",
    body: "MUSD from their balance, BTC or MEZO swapped on Tigris, or MUSD borrowed against their BTC. Whatever they pick, the router pays you the invoiced amount in one transaction.",
    src: "/motion/01-pay-any-way.svg",
    dur: 8,
  },
  {
    label: "Borrow against BTC",
    title: "Spend Bitcoin without selling it.",
    body: "Customers borrow MUSD against their BTC inside the payment. The router checks the loan afterwards and reverts anything that would leave it under 160% collateral.",
    src: "/motion/02-borrow-dont-sell.svg",
    dur: 10,
  },
  {
    label: "Gasless",
    title: "Customers sign. Mezout pays the gas.",
    body: "Mezout’s relayer submits the payment and covers the network fee, so a customer paying from an EVM wallet never needs a gas token.",
    src: "/motion/04-gasless.svg",
    dur: 8,
  },
  {
    label: "Passkey accounts",
    title: "No wallet, seed phrase or gas for merchants.",
    body: "Sign up with Face ID, Touch ID or your phone and get your own ERC-4337 smart account. Withdrawals are gasless and confirmed with the passkey.",
    src: "/motion/03-passkey-merchant.svg",
    dur: 9,
  },
  {
    label: "Integrations",
    title: "Plugs into how you already sell.",
    body: "Share a link or QR code, call the REST API, or install the WooCommerce plugin. A signed invoice.paid webhook tells your store when to fulfil the order.",
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
        <div role="tablist" aria-label="How Mezout works" className="mx-auto flex w-max gap-1 rounded-full border border-stone-200 bg-white p-1 shadow-sm">
          {TABS.map((t, i) => (
            <button
              key={t.label}
              role="tab"
              aria-selected={i === active}
              onClick={() => choose(i)}
              className={`relative overflow-hidden whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors ${
                i === active ? "bg-stone-900 font-medium text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {t.label}
              {i === active && auto && visible && (
                <span
                  key={run}
                  aria-hidden
                  className="tab-progress absolute inset-x-4 bottom-1 h-0.5 origin-left rounded-full bg-white/50"
                  style={{ animationDuration: `${t.dur}s` }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-2 text-center" aria-live="polite">
        <h3 className="text-xl font-semibold tracking-tight">{tab.title}</h3>
        <p className="text-stone-600">{tab.body}</p>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-stone-100/70 p-2 shadow-sm">
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50">
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
