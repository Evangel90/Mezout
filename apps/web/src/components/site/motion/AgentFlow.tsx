"use client";

import { useTimeline } from "./useTimeline";

/**
 * The HTTP 402 loop an agent runs, three times over: request, 402 with a Mezout invoice, pay within its caps, retry
 * and get 200. The session budget fills by 0.05 MUSD per paid request. Reduced motion shows the third request done.
 */
const STAGES = [
  { code: "GET /api/report", title: "Request", body: "The agent calls your paid API." },
  { code: "402 · 0.05 MUSD", title: "Payment required", body: "Your API names the price." },
  { code: "pay_invoice", title: "Pay within limits", body: "The agent pays, within its spending caps." },
  { code: "200 OK", title: "Served", body: "Mezo confirms it. The agent gets the answer." },
];
const PER_CALL = 0.05;
const SESSION_CAP = 10;
const ROUNDS = 3;
const STEP_MS = 1000;

export function AgentFlow() {
  const { ref, step } = useTimeline<HTMLDivElement>(STAGES.length * ROUNDS, STEP_MS);
  const stage = step % STAGES.length;
  const round = Math.floor(step / STAGES.length);
  const paidCalls = round + (stage >= 2 ? 1 : 0);
  const spent = paidCalls * PER_CALL;

  return (
    <div ref={ref} className="space-y-4">
      <p className="sr-only">
        An animation of the HTTP 402 loop: the agent requests a paid endpoint, receives 402 Payment Required for 0.05
        MUSD, pays the invoice within its spending caps, retries and receives 200 OK. Each paid request adds 0.05 MUSD
        to the session total, out of a 10 MUSD session cap.
      </p>
      <ol aria-hidden className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((s, i) => {
          const active = i === stage;
          const done = i < stage;
          return (
            <li
              key={s.title}
              className={`relative space-y-3 rounded-2xl border p-4 transition-all duration-500 ${
                active ? "border-agent-400 bg-agent-500/15 shadow-[0_0_0_1px_rgb(157_133_255/0.35)]" : done ? "border-white/15 bg-white/[0.04]" : "border-white/10 bg-transparent"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-stone-500">0{i + 1}</span>
                <span
                  className={`h-2 w-2 rounded-full transition-colors duration-500 ${active ? "bg-agent-400" : done ? "bg-musd-400" : "bg-white/15"}`}
                />
              </div>
              <p className={`font-mono text-sm ${i === 1 ? "text-signal-300" : i === 3 ? "text-musd-300" : "text-white"}`}>{s.code}</p>
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">{s.title}</p>
                <p className="text-xs leading-relaxed text-stone-400">{s.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div aria-hidden className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className="font-mono text-stone-400">get_budget</span>
          <span className="font-mono tabular-nums text-stone-300">
            <span className="text-white">{spent.toFixed(2)}</span> of {SESSION_CAP.toFixed(2)} MUSD this session · max 1.00 per payment
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {Array.from({ length: ROUNDS }, (_, i) => (
            <li
              key={i}
              className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-all duration-500 ${
                i < paidCalls ? "border-agent-400/50 bg-agent-500/20 text-white" : "border-dashed border-white/15 text-stone-600"
              }`}
            >
              <span>#{i + 1}</span>
              <span>{i < paidCalls ? "0.05" : "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
