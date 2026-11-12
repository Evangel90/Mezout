"use client";

import { useEffect, useRef, useState } from "react";

/** One step per animation in public/motion; `dur` is the scene's loop length in seconds (see docs/motion). */
const TABS = [
  {
    title: "They choose. You get MUSD.",
    body: "MUSD, BTC, MEZO or a loan against Bitcoin. They pay your price.",
    src: "/motion/01-pay-any-way.svg",
    dur: 8,
  },
  {
    title: "Spend Bitcoin without selling it.",
    body: "Customers borrow MUSD against their BTC. Loans below 160% collateral are refused.",
    src: "/motion/02-borrow-dont-sell.svg",
    dur: 10,
  },
  {
    title: "They sign. Mezout pays the gas.",
    body: "Customers never need a gas token. Mezout covers the network fee.",
    src: "/motion/04-gasless.svg",
    dur: 8,
  },
  {
    title: "No wallet needed to get paid.",
    body: "Sign up with Face ID, Touch ID or your phone. Withdrawals are free.",
    src: "/motion/03-passkey-merchant.svg",
    dur: 9,
  },
  {
    title: "Works with how you sell.",
    body: "Links, QR codes, Shopify, WooCommerce, your own site, the API or AI agents.",
    src: "/motion/05-plug-in.svg",
    dur: 9,
  },
];

/**
 * The animations as a stepper: the scene on top, one card per scene below. While on screen it advances after each
 * scene's loop; choosing a card stops that. Each switch loads the scene under a fresh URL so it starts from the
 * beginning. Phones get the scene at a readable size, panning slowly across it as the flow moves left to right.
 */
export function Showcase() {
  const [active, setActive] = useState(0);
  const [run, setRun] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);

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

  // On phones the cards scroll sideways: keep the active one in view without moving the page.
  useEffect(() => {
    const r = rail.current;
    const card = r?.children[active] as HTMLElement | undefined;
    if (!r || !card || r.scrollWidth <= r.clientWidth) return;
    const left = r.scrollLeft + card.getBoundingClientRect().left - r.getBoundingClientRect().left - 16;
    r.scrollTo({ left, behavior: "smooth" });
  }, [active]);

  const choose = (i: number) => {
    setAuto(false);
    setActive(i);
    setRun((r) => r + 1);
  };
  const tab = TABS[active];

  return (
    <div ref={ref} className="space-y-4">
      <div className="rounded-4xl border border-stone-200 bg-white p-1.5 shadow-lift sm:p-2">
        <div className="pan-stage overflow-hidden rounded-3xl bg-canvas motion-reduce:overflow-x-auto sm:motion-reduce:overflow-hidden">
          <div key={run} className="pan-track w-[680px] sm:w-full" style={{ ["--pan" as string]: `${tab.dur}s` }}>
            <div className="aspect-[1120/440] p-4 sm:p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${tab.src}?run=${run}`} alt={`${tab.title} ${tab.body}`} className="caption-in h-full w-full object-contain" />
            </div>
          </div>
        </div>
      </div>

      <div
        ref={rail}
        role="tablist"
        aria-label="How Mezout works"
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5 [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t, i) => {
          const on = i === active;
          return (
            <button
              key={t.title}
              role="tab"
              aria-selected={on}
              onClick={() => choose(i)}
              className={`relative flex w-[15.5rem] shrink-0 snap-start flex-col items-start justify-start overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 sm:w-auto sm:p-5 ${
                on ? "border-stone-200 bg-white shadow-card" : "border-transparent hover:bg-white/60"
              } ${i === TABS.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""}`}
            >
              <span className={`font-mono text-[11px] tabular-nums transition-colors ${on ? "text-signal-600" : "text-stone-400"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={`mt-2 block font-semibold tracking-tight transition-colors ${on ? "text-ink" : "text-stone-500"}`}>{t.title}</span>
              <span className={`mt-1.5 block text-sm leading-relaxed transition-colors ${on ? "text-stone-600" : "text-stone-400"}`}>{t.body}</span>
              <span aria-hidden className={`absolute inset-x-4 bottom-0 h-0.5 overflow-hidden rounded-full bg-stone-200/70 sm:inset-x-5 ${on ? "" : "opacity-0"}`}>
                {on && auto && visible && (
                  <span key={run} className="tab-progress block h-full origin-left bg-signal-500" style={{ animationDuration: `${t.dur}s` }} />
                )}
                {on && !auto && <span className="block h-full bg-signal-500" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
