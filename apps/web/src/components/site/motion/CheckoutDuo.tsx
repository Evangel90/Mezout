"use client";

import type { ReactNode } from "react";
import { useTimeline } from "./useTimeline";

/**
 * The landing page's hero scene: a person pays a coffee order with BTC while an AI agent hits an API, gets a 402,
 * pays 0.05 MUSD and gets a 200. Both payments land on the merchant as exact MUSD. Drawn in HTML and CSS, stepped by
 * useTimeline; with reduced motion it shows the finished state.
 */
const STEPS = 16;
const STEP_MS = 700;

// Human: 1 picks BTC, 3 presses Pay now, 3-4 signing, 5 paid. Agent: 2 GET, 3 402, 5-6 pays, 7 retries, 8 200.
// Merchant: 6 the coffee order lands, 9 the API call lands. 10-15 hold.
const at = (step: number, from: number) => step >= from;

export function CheckoutDuo() {
  const { ref, step } = useTimeline<HTMLDivElement>(STEPS, STEP_MS);

  return (
    <div ref={ref} className="relative">
      <p className="sr-only">
        An animation: a customer pays Merchant Store 25.00 MUSD for a coffee order by choosing Pay with BTC.
        At the same time an AI agent requests a paid API, gets 402 Payment Required for 0.05 MUSD, pays the invoice
        within its spending cap, retries and gets 200 OK. The merchant receives both payments as exact MUSD.
      </p>
      <div aria-hidden className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_5rem_minmax(0,0.92fr)_5rem_minmax(0,1fr)] lg:gap-0">
        <HumanCheckout step={step} />
        <Connector active={step === 5} done={at(step, 6)} tone="signal" label="BTC → MUSD" />
        <div className="order-3 flex flex-col lg:order-none">
          <MerchantFeed step={step} />
        </div>
        <Connector active={step === 8} done={at(step, 9)} tone="agent" label="0.05 MUSD" reverse />
        <div className="order-2 flex flex-col lg:order-none">
          <AgentTerminal step={step} />
        </div>
      </div>
    </div>
  );
}

function Lane({ icon, label, tone }: { icon: ReactNode; label: string; tone: "signal" | "agent" | "musd" }) {
  const color = { signal: "bg-signal-500 text-ink", agent: "bg-agent-500 text-white", musd: "bg-musd-400 text-ink" }[tone];
  return (
    <p className="mb-2.5 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">
      <span className={`flex h-5 w-5 items-center justify-center rounded-md ${color}`}>{icon}</span>
      {label}
    </p>
  );
}

const methods = [
  { id: "MUSD", label: "MUSD", dot: "bg-musd-500" },
  { id: "BTC", label: "BTC", dot: "bg-[#f7931a]" },
  { id: "MEZO", label: "MEZO", dot: "bg-rose-600" },
  { id: "BORROW", label: "Borrow against BTC", dot: "bg-signal-600" },
];

function HumanCheckout({ step }: { step: number }) {
  const picked = at(step, 1);
  const pressing = step === 3;
  const signing = step === 3 || step === 4;
  const paid = at(step, 5);
  return (
    <div className="order-1 flex flex-col lg:order-none">
      <Lane label="A person" tone="signal" icon={<Glyph d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6" />} />
      <div className="flex-1 overflow-hidden rounded-2xl bg-white text-ink shadow-lift ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <span className="text-[13px] font-semibold tracking-tight">Merchant Store</span>
          <span className="font-mono text-[10px] text-stone-500">Order 1001</span>
        </div>
        <div className="space-y-3 p-4">
          <div className="space-y-1 text-[12px] text-stone-600">
            <Line l="2 × Flat white" r="11.00" />
            <Line l="1 × Croissant" r="4.50" />
            <Line l="Beans, 250 g" r="9.50" />
            <div className="flex justify-between border-t border-stone-200 pt-1.5 text-[13px] font-semibold text-ink">
              <span>Total</span>
              <span className="tabular-nums">25.00 MUSD</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-stone-200 text-[12px]">
            {methods.map((m, i) => {
              const selected = m.id === (picked ? "BTC" : "MUSD");
              return (
                <div
                  key={m.id}
                  className={`border-stone-200 px-3 py-2 transition-colors duration-300 ${i > 0 ? "border-t" : ""} ${selected ? "bg-signal-50/70" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-colors duration-300 ${selected ? "border-ink" : "border-stone-300"}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full bg-ink transition-transform duration-300 ${selected ? "scale-100" : "scale-0"}`} />
                    </span>
                    <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                    <span className={selected ? "font-medium" : "text-stone-600"}>{m.label}</span>
                  </div>
                  {m.id === "BTC" && (
                    <div className={`grid transition-all duration-300 ${selected ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <p className="overflow-hidden pl-[3.1rem] text-[11px] text-stone-500">≈ 0.000318 BTC · no network fee</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div
            className={`flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all duration-300 ${
              paid ? "bg-musd-500 text-white" : "bg-ink text-white"
            } ${pressing ? "scale-[0.97]" : ""}`}
          >
            {paid ? (
              <>
                <Glyph d="M5 12.5l4.5 4.5L19 7.5" className="h-4 w-4" /> Paid
              </>
            ) : signing ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin" /> Sign once…
              </>
            ) : (
              "Pay now"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const agentLines = [
  { from: 0, text: "task: buy the market report", tone: "text-stone-500" },
  { from: 2, text: "GET /api/report", tone: "text-stone-200" },
  { from: 3, text: "← 402 Payment Required", tone: "text-signal-300" },
  { from: 3, text: "   0.05 MUSD · x402 v2 · inv_7c1e…", tone: "text-stone-500" },
  { from: 5, text: "pay_invoice inv_7c1e…", tone: "text-stone-200" },
  { from: 6, text: "   ✓ under cap 1.00 MUSD / payment", tone: "text-musd-300" },
  { from: 7, text: "GET /api/report  PAYMENT-SIGNATURE", tone: "text-stone-200" },
  { from: 8, text: "← 200 OK", tone: "font-semibold text-musd-300" },
];

function AgentTerminal({ step }: { step: number }) {
  return (
    <div className="flex flex-1 flex-col">
      <Lane label="An AI agent" tone="agent" icon={<Glyph d="M12 4v3M7 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9.5 12.5h.01M14.5 12.5h.01" />} />
      <div className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-stone-900 shadow-lift">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </span>
          <span className="font-mono text-[10px] text-stone-500">mezout mcp</span>
        </div>
        <div className="min-h-[13.25rem] space-y-1.5 overflow-hidden p-4 font-mono text-[11.5px] leading-relaxed">
          {agentLines.map((l, i) => (
            <p
              key={i}
              className={`whitespace-pre transition-all duration-300 ${l.tone} ${at(step, l.from) ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
            >
              {l.text}
            </p>
          ))}
          <p className={`text-stone-500 transition-opacity ${at(step, 8) ? "opacity-0" : "opacity-100"}`}>
            <span className="inline-block h-3.5 w-1.5 translate-y-0.5 bg-agent-400 motion-safe:animate-pulse" />
          </p>
        </div>
      </div>
    </div>
  );
}

function MerchantFeed({ step }: { step: number }) {
  const rows = [
    { from: 6, amount: "+25.00", what: "Order 1001", via: "Paid with BTC", who: "Person", tone: "bg-signal-500 text-ink" },
    { from: 9, amount: "+0.05", what: "GET /api/report", via: "Paid by an agent", who: "Agent", tone: "bg-agent-500 text-white" },
  ];
  return (
    <div className="flex flex-1 flex-col">
      <Lane label="The merchant" tone="musd" icon={<Glyph d="M4 9l1.5-5h13L20 9M4 9h16M5 11v9h14v-9" />} />
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white text-ink shadow-lift ring-1 ring-black/5">
        <div className="border-b border-stone-200 px-4 py-3">
          <p className="text-[13px] font-semibold tracking-tight">Payments</p>
          <p className="text-[11px] text-stone-500">Settled on Mezo in MUSD</p>
        </div>
        <ul className="divide-y divide-stone-100">
          {rows.map((r) => {
            const shown = at(step, r.from);
            return (
              <li key={r.what} className={`flex items-center gap-3 px-4 py-3 transition-all duration-500 ${shown ? "opacity-100" : "opacity-0"}`}>
                <span className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${r.tone}`}>{r.who}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{r.what}</span>
                  <span className="block text-[11px] text-stone-500">{r.via}</span>
                </span>
                <span className={`font-mono text-[13px] font-semibold tabular-nums text-musd-700 ${shown ? "pop-in" : ""}`}>{r.amount}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-auto px-4 pb-3 pt-4 text-[11px] leading-relaxed text-stone-500">
          Both paid through the same verified router contract. One invoice, one payment.
        </p>
        <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-4 py-2.5 text-[11px]">
          <span className="text-stone-500">No admin keys · non-custodial</span>
          <span className="flex items-center gap-1 font-medium text-musd-700">
            <Glyph d="M5 12.5l4.5 4.5L19 7.5" className="h-3.5 w-3.5" /> Exact MUSD
          </span>
        </div>
      </div>
    </div>
  );
}

function Connector({ active, done, tone, label, reverse = false }: { active: boolean; done: boolean; tone: "signal" | "agent"; label: string; reverse?: boolean }) {
  const dot = tone === "signal" ? "bg-signal-400 shadow-[0_0_14px_4px_rgb(255_138_61/0.55)]" : "bg-agent-400 shadow-[0_0_14px_4px_rgb(157_133_255/0.55)]";
  const line = tone === "signal" ? "bg-signal-400/70" : "bg-agent-400/70";
  return (
    <div className="relative hidden h-full items-center lg:flex">
      <div className="relative mx-1 h-px w-full bg-white/15">
        <div className={`absolute inset-y-0 ${reverse ? "right-0" : "left-0"} transition-all duration-700 ${line} ${done ? "w-full" : "w-0"}`} />
        {active && (
          <span
            className={`flow-dot absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot}`}
            style={reverse ? { animationDirection: "reverse" } : undefined}
          />
        )}
      </div>
      <span
        className={`absolute left-1/2 top-[calc(50%+0.6rem)] -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider transition-opacity ${
          active || done ? "text-stone-400 opacity-100" : "opacity-0"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function Line({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between">
      <span>{l}</span>
      <span className="tabular-nums">{r}</span>
    </div>
  );
}

function Glyph({ d, className = "h-3 w-3" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
