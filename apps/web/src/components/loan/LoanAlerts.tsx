"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useSignMessage } from "wagmi";
import {
  LOAN_ALERT_MAX_THRESHOLD,
  LOAN_ALERT_MIN_THRESHOLD,
  loanAlertsSubscribeMessage,
  loanAlertsUnsubscribeMessage,
  normalizeThresholds,
} from "@mezout/sdk";
import { Alert, Badge, Button, CardHeader, ExternalLink, Field, cardClass, inputClass, relativeTime } from "@/components/ui";
import { mezoNetwork } from "@/lib/network";

type Status = { active: boolean; thresholds: number[]; redemption: boolean; last_alert_at: string | null; delivery_failed: boolean };

async function call(method: "POST" | "DELETE", body: unknown): Promise<Status> {
  const res = await fetch("/api/loan-alerts", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as Status;
}

const parseThreshold = (v: string) => (/^\d{3}$/.test(v.trim()) ? Number(v.trim()) : null);

/**
 * Opt-in alerts for the connected borrower. Mezout checks the loan every 5 minutes and posts to a URL the borrower
 * chooses (Discord, Slack, ntfy or any https endpoint): no account, email or paid service. The borrower signs the
 * settings with their wallet, which costs no gas and gives Mezout no control over the loan.
 */
export function LoanAlerts({ borrower }: { borrower: Address }) {
  const { signMessageAsync } = useSignMessage();
  const status = useQuery({
    queryKey: ["loan-alerts", borrower],
    queryFn: async () => {
      const res = await fetch(`/api/loan-alerts?address=${borrower}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load alert settings");
      return (await res.json()) as Status;
    },
  });
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [first, setFirst] = useState("180");
  const [second, setSecond] = useState("165");
  const [redemption, setRedemption] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const thresholds = [first, second].filter((v) => v.trim() !== "").map(parseThreshold);
  const thresholdError = thresholds.some((t) => t === null || t < LOAN_ALERT_MIN_THRESHOLD || t > LOAN_ALERT_MAX_THRESHOLD)
    ? `Use whole percentages from ${LOAN_ALERT_MIN_THRESHOLD}% to ${LOAN_ALERT_MAX_THRESHOLD}%.`
    : null;
  const urlError = url && !/^https:\/\/[^\s]+$/.test(url.trim()) ? "Use an https:// URL." : null;
  const nothing = thresholds.length === 0 && !redemption;

  async function turnOn(e: React.FormEvent) {
    e.preventDefault();
    if (thresholdError || urlError || !url || nothing) return;
    setError(null);
    try {
      const settings = { url: new URL(url.trim()).toString(), thresholds: normalizeThresholds(thresholds as number[]), redemption };
      const issuedAt = new Date().toISOString();
      setBusy("Sign the message in your wallet (no gas)…");
      const signature = await signMessageAsync({ message: loanAlertsSubscribeMessage(borrower, settings, issuedAt, mezoNetwork) });
      setBusy("Sending a test alert…");
      await call("POST", { address: borrower, issuedAt, signature, ...settings });
      setEditing(false);
      setUrl("");
      await status.refetch();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  async function turnOff() {
    setError(null);
    try {
      const issuedAt = new Date().toISOString();
      setBusy("Sign the message in your wallet (no gas)…");
      const signature = await signMessageAsync({ message: loanAlertsUnsubscribeMessage(borrower, issuedAt, mezoNetwork) });
      setBusy("Turning alerts off…");
      await call("DELETE", { address: borrower, issuedAt, signature });
      await status.refetch();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  const s = status.data;
  return (
    <section className={`${cardClass} space-y-4 p-6`} aria-labelledby="loan-alerts">
      <CardHeader
        id="loan-alerts"
        title="Alerts"
        description="Get a message when your ratio drops or your loan nears the front of the redemption line. Mezout checks every 5 minutes."
        action={s?.active ? <Badge tone="success">On</Badge> : s ? <Badge>Off</Badge> : null}
      />

      {s?.active && !editing ? (
        <div className="space-y-3 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-stone-700">
            {s.thresholds.length > 0 && <li>When the collateral ratio drops below {s.thresholds.map((t) => `${t}%`).join(" or ")}</li>}
            {s.redemption && <li>When your loan comes close to the front of the redemption line</li>}
            <li>If the loan closes or is liquidated (alerts then stop)</li>
          </ul>
          <p className="text-xs text-stone-500">{s.last_alert_at ? `Last alert ${relativeTime(s.last_alert_at)}.` : "No alerts sent yet."}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={!!busy}>
              Change
            </Button>
            <Button variant="ghost" size="sm" onClick={() => turnOff()} disabled={!!busy} loading={!!busy}>
              {busy ?? "Turn off"}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={turnOn} className="space-y-4" noValidate>
          {s?.delivery_failed && (
            <Alert tone="warning">Alerts stopped because the URL kept failing. Check it and turn them on again.</Alert>
          )}
          <Field
            label="Send alerts to"
            error={urlError}
            hint={
              <>
                A Discord or Slack incoming-webhook URL, an{" "}
                <ExternalLink href="https://ntfy.sh" className="underline underline-offset-2">
                  ntfy
                </ExternalLink>{" "}
                topic (https://ntfy.sh/your-secret-topic, push to your phone for free) or any https endpoint. Mezout keeps it private.
              </>
            }
          >
            {(ids) => (
              <input
                {...ids}
                className={inputClass}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://ntfy.sh/…"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
          <Field label="Alert when the ratio drops below" error={thresholdError} hint="Up to two levels. Mezo liquidates below 110%; Mezout's checkout floor is 160%.">
            {(ids) => (
              <div className="flex items-center gap-2">
                <input {...ids} className={`${inputClass} w-24 tabular-nums`} value={first} onChange={(e) => setFirst(e.target.value)} inputMode="numeric" aria-label="First level, percent" />
                <span className="text-sm text-stone-500">% and</span>
                <input className={`${inputClass} w-24 tabular-nums`} value={second} onChange={(e) => setSecond(e.target.value)} inputMode="numeric" aria-label="Second level, percent" />
                <span className="text-sm text-stone-500">%</span>
              </div>
            )}
          </Field>
          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" className="mt-0.5" checked={redemption} onChange={(e) => setRedemption(e.target.checked)} />
            Alert me when my loan comes close to the front of the redemption line
          </label>
          {nothing && <p className="text-xs text-red-700">Choose a ratio level or redemption alerts.</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!url || !!urlError || !!thresholdError || nothing || !!busy} loading={!!busy}>
              {busy ?? (s?.active ? "Save alerts" : "Turn on alerts")}
            </Button>
            {editing && (
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={!!busy}>
                Cancel
              </Button>
            )}
          </div>
          <p className="text-xs leading-relaxed text-stone-500">
            You sign a message (no gas) to prove the wallet is yours; Mezout sends a test alert straight away.
          </p>
        </form>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      <p className="border-t border-stone-100 pt-3 text-xs leading-relaxed text-stone-500">
        Mezout only tells you. It never repays, adds BTC or tops up your loan automatically: that would need you to give it control of
        your wallet, which it does not ask for. Acting on an alert is always a transaction you sign here.
      </p>
    </section>
  );
}

function message(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string } | null;
  const text = e?.shortMessage ?? e?.message ?? "Something went wrong.";
  return /rejected|denied/i.test(text) ? "You cancelled the request in your wallet." : text;
}
