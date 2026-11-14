import "server-only";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { getAddress, type Address, type Hex } from "viem";
import {
  LOAN_ALERT_MAX_THRESHOLD,
  LOAN_ALERT_MAX_THRESHOLDS,
  LOAN_ALERT_MIN_THRESHOLD,
  loanAlertsSubscribeMessage,
  loanAlertsUnsubscribeMessage,
  normalizeThresholds,
  redemptionPosition,
  type LoanAlertSettings,
  type RedemptionQueue,
} from "@mezout/sdk";
import { REQUEST_TTL_MS, type VerifySignature } from "./apiKeys";
import type { Db } from "./db/client";
import { loanAlerts } from "./db/schema";
import type { Sender } from "./webhooks";
import { checkEndpointHost, checkEndpointUrl, type Resolver } from "./webhookSender";

export type LoanAlertRow = typeof loanAlerts.$inferSelect;
export class LoanAlertError extends Error {}

/** A ratio threshold counts as cleared only once the ratio is this many points above it, so alerts do not flap. */
export const RECOVERY_MARGIN = 5;
/** Alerts stop after this many failed posts in a row; the borrower turns them on again from /loan. */
export const MAX_FAILURES = 12;
/** Posts per scheduled run, and how many go out at once, so a burst cannot hold up the run. */
export const MAX_SENDS_PER_RUN = 100;
const SEND_CONCURRENCY = 10;

export type SignedLoanAlertRequest = { address: Address; issuedAt: string; signature: Hex };

/** Checks the settings a borrower asked for, before anything is signed or stored. */
export function checkSettings(input: LoanAlertSettings, allowPrivate: boolean): LoanAlertSettings {
  const thresholds = normalizeThresholds(input.thresholds);
  if (thresholds.length > LOAN_ALERT_MAX_THRESHOLDS) throw new LoanAlertError(`Choose at most ${LOAN_ALERT_MAX_THRESHOLDS} ratio alerts.`);
  for (const t of thresholds) {
    if (!Number.isInteger(t) || t < LOAN_ALERT_MIN_THRESHOLD || t > LOAN_ALERT_MAX_THRESHOLD) {
      throw new LoanAlertError(`Ratio alerts must be whole percentages from ${LOAN_ALERT_MIN_THRESHOLD}% to ${LOAN_ALERT_MAX_THRESHOLD}%.`);
    }
  }
  if (thresholds.length === 0 && !input.redemption) throw new LoanAlertError("Choose at least one ratio alert or redemption alerts.");
  let url: string;
  try {
    url = checkEndpointUrl(input.url, allowPrivate);
  } catch (err) {
    throw new LoanAlertError(err instanceof Error ? err.message : "Invalid url");
  }
  return { url, thresholds, redemption: input.redemption };
}

/** Checks the request's timestamp and signature, and that it is newer than the last one accepted for this wallet. */
async function verifyRequest(db: Db, req: SignedLoanAlertRequest, message: string, verify: VerifySignature, now: number) {
  const issued = Date.parse(req.issuedAt);
  if (Number.isNaN(issued) || new Date(issued).toISOString() !== req.issuedAt) {
    throw new LoanAlertError("issuedAt must be an ISO 8601 UTC timestamp");
  }
  if (issued > now + 60_000 || now - issued > REQUEST_TTL_MS) throw new LoanAlertError("This request has expired. Sign a new one.");
  const address = getAddress(req.address);
  // A malformed signature makes the verifier throw; that is a mismatch, not a server error.
  if (!(await verify({ address, message, signature: req.signature }).catch(() => false))) {
    throw new LoanAlertError("The signature does not match this wallet.");
  }
  const [existing] = await db.select({ signedAt: loanAlerts.signedAt }).from(loanAlerts).where(eq(loanAlerts.borrower, address));
  if (existing && existing.signedAt.getTime() >= issued) throw new LoanAlertError("This signed request was already used. Sign a new one.");
  return { address, issued: new Date(issued) };
}

export type SubscribeDeps = {
  verify: VerifySignature;
  /** True when the wallet has an open Mezo loan: alerts are only for borrowers. */
  hasLoan: (address: Address) => Promise<boolean>;
  /** Posts the confirmation, so a mistyped URL is caught now rather than when the loan is at risk. */
  send: Sender;
  allowPrivate: boolean;
  resolve?: Resolver;
};

/** Turns on (or changes) a borrower's alerts from a signed loanAlertsSubscribeMessage. */
export async function subscribe(
  db: Db,
  req: SignedLoanAlertRequest & LoanAlertSettings,
  deps: SubscribeDeps,
  now = Date.now(),
): Promise<LoanAlertRow> {
  const settings = checkSettings(req, deps.allowPrivate);
  // The message is rebuilt from the normalized settings, so the client must have signed exactly those.
  const message = loanAlertsSubscribeMessage(req.address, settings, req.issuedAt);
  const { address, issued } = await verifyRequest(db, req, message, deps.verify, now);
  try {
    await checkEndpointHost(settings.url, deps.allowPrivate, deps.resolve);
  } catch (err) {
    throw new LoanAlertError(err instanceof Error ? err.message : "Invalid url");
  }
  if (!(await deps.hasLoan(address))) throw new LoanAlertError("This wallet has no open Mezo loan to watch.");

  const confirmation = alertPayload(settings.url, {
    type: "loan.alerts_enabled",
    borrower: address,
    text: `Loan alerts are on for ${short(address)}. ${describeSettings(settings)} Turn them off at any time on the Mezout loan page.`,
  });
  const ok = await deps
    .send(settings.url, confirmation.body, confirmation.headers)
    .then((r) => r.statusCode >= 200 && r.statusCode < 300)
    .catch(() => false);
  if (!ok) throw new LoanAlertError("We couldn't deliver a test alert to that URL. Check it and try again.");

  const values = {
    borrower: address,
    url: settings.url,
    thresholds: settings.thresholds,
    redemption: settings.redemption,
    signedAt: issued,
    breachedThreshold: null,
    redemptionHigh: false,
    failures: 0,
    disabledAt: null,
  };
  // The signedAt guard in the update makes two racing requests with the same signature store at most one.
  const [row] = await db
    .insert(loanAlerts)
    .values(values)
    .onConflictDoUpdate({ target: loanAlerts.borrower, set: values, setWhere: lt(loanAlerts.signedAt, issued) })
    .returning();
  if (!row) throw new LoanAlertError("This signed request was already used. Sign a new one.");
  return row;
}

/** Turns a borrower's alerts off from a signed loanAlertsUnsubscribeMessage and forgets the URL. */
export async function unsubscribe(db: Db, req: SignedLoanAlertRequest, verify: VerifySignature, now = Date.now()): Promise<boolean> {
  const message = loanAlertsUnsubscribeMessage(req.address, req.issuedAt);
  const { address, issued } = await verifyRequest(db, req, message, verify, now);
  const rows = await db
    .update(loanAlerts)
    .set({ url: null, disabledAt: new Date(now), signedAt: issued })
    .where(and(eq(loanAlerts.borrower, address), lt(loanAlerts.signedAt, issued)))
    .returning({ borrower: loanAlerts.borrower });
  return rows.length > 0;
}

/** What the loan page shows about a wallet's alerts. Never includes the URL, which is the borrower's secret. */
export async function alertStatus(db: Db, address: Address) {
  const [row] = await db.select().from(loanAlerts).where(eq(loanAlerts.borrower, getAddress(address)));
  const active = !!row && !row.disabledAt;
  return {
    active,
    thresholds: active ? row.thresholds : [],
    redemption: active ? row.redemption : false,
    last_alert_at: active ? (row.lastAlertAt?.toISOString() ?? null) : null,
    // True when Mezout turned alerts off because the URL kept failing, so the page can say why.
    delivery_failed: !!row?.disabledAt && row.failures >= MAX_FAILURES,
  };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (v: number) => `${v.toFixed(0)}%`;
const musd = (v: bigint) => `${Number(v / 10n ** 18n).toLocaleString("en-US")} MUSD`;

function describeSettings(s: Pick<LoanAlertSettings, "thresholds" | "redemption">) {
  const parts = [];
  if (s.thresholds.length) parts.push(`You'll hear when the collateral ratio drops below ${s.thresholds.map((t) => `${t}%`).join(" or ")}.`);
  if (s.redemption) parts.push("You'll hear when the loan comes close to the front of Mezo's redemption line.");
  return parts.join(" ");
}

type AlertEvent = { type: string; borrower: Address; text: string; [k: string]: unknown };

/**
 * The request for one alert, shaped for the service the URL points at: Discord wants `content`, ntfy a plain-text
 * body, Slack and everything else JSON with `text` plus the structured fields.
 */
export function alertPayload(url: string, event: AlertEvent): { body: string; headers: Record<string, string> } {
  const host = new URL(url).host;
  const text = `Mezout loan alert: ${event.text}`;
  if (host === "ntfy.sh" || host.endsWith(".ntfy.sh")) {
    return { body: text, headers: { "content-type": "text/plain; charset=utf-8", title: "Mezout loan alert" } };
  }
  if (host.endsWith("discord.com")) return { body: JSON.stringify({ content: text }), headers: { "content-type": "application/json" } };
  return { body: JSON.stringify({ ...event, text }), headers: { "content-type": "application/json", "user-agent": "Mezout-Alerts/1" } };
}

/** The lowest chosen threshold the ratio is under, keeping a breached one until the ratio clears it by the margin. */
export function breachedThreshold(icrPercent: number, thresholds: number[], previous: number | null): number | null {
  const under = thresholds.filter((t) => icrPercent < t);
  const current = under.length ? Math.min(...under) : null;
  if (previous !== null && thresholds.includes(previous) && (current === null || current > previous) && icrPercent < previous + RECOVERY_MARGIN) {
    return previous;
  }
  return current;
}

type Decision = { row: LoanAlertRow; events: AlertEvent[]; patch: Partial<LoanAlertRow> };

/** Decides, for each active subscription, what to send and the state to store. Pure, so it is tested with fixed loans. */
export function decideAlerts(rows: LoanAlertRow[], queue: Omit<RedemptionQueue, "readAt">, appUrl: string): Decision[] {
  const byOwner = new Map(queue.troves.map((t) => [t.owner, t]));
  const link = (a: Address) => `${appUrl}/loan?address=${a}`;
  return rows.map((row) => {
    const borrower = getAddress(row.borrower);
    const trove = byOwner.get(borrower);
    if (!trove || trove.debt === 0n) {
      return {
        row,
        events: [
          {
            type: "loan.closed",
            borrower,
            text: `${short(borrower)} no longer has an open Mezo loan (repaid and closed, fully redeemed, or liquidated), so these alerts are now off. ${link(borrower)}`,
          },
        ],
        patch: { disabledAt: new Date(), url: null },
      };
    }
    const events: AlertEvent[] = [];
    const icr = Number((trove.coll * queue.price * 10_000n) / trove.debt / 10n ** 18n) / 100;
    const breached = breachedThreshold(icr, row.thresholds, row.breachedThreshold);
    if (breached !== null && (row.breachedThreshold === null || breached < row.breachedThreshold)) {
      const liq = Number((trove.debt * queue.mcr) / trove.coll / 10n ** 18n);
      events.push({
        type: "loan.ratio_below",
        borrower,
        threshold_percent: breached,
        ratio_percent: icr,
        text: `${short(borrower)}'s collateral ratio is ${pct(icr)}, below your ${breached}% alert. Mezo can liquidate it below 110% (BTC at about $${liq.toLocaleString("en-US")}). Repay MUSD or add BTC: ${link(borrower)}`,
      });
    }
    let redemptionHigh = row.redemptionHigh;
    if (row.redemption) {
      const p = redemptionPosition(queue, borrower);
      redemptionHigh = p.exposure === "high";
      if (redemptionHigh && !row.redemptionHigh) {
        events.push({
          type: "loan.redemption_risk",
          borrower,
          position: p.position,
          musd_ahead: p.debtAhead.toString(),
          text: `${short(borrower)}'s loan is number ${p.position} in Mezo's redemption line, with only ${musd(p.debtAhead)} of other loans in front. A redemption could repay part of the debt with your BTC. A higher ratio moves it back: ${link(borrower)}`,
        });
      }
    }
    return { row, events, patch: { breachedThreshold: breached, redemptionHigh } };
  });
}

/**
 * The scheduled check: every active subscription against one redemption queue (read once per run, whatever the
 * number of borrowers). State is stored only after a successful post, so a failed alert is retried next run.
 */
export async function evaluateLoanAlerts(
  db: Db,
  readQueue: () => Promise<RedemptionQueue>,
  send: Sender,
  opts: { appUrl: string; now?: number },
): Promise<{ checked: number; sent: number; failed: number }> {
  const rows = await db.select().from(loanAlerts).where(isNull(loanAlerts.disabledAt));
  if (rows.length === 0) return { checked: 0, sent: 0, failed: 0 };
  const queue = await readQueue();
  const now = new Date(opts.now ?? Date.now());
  const decisions = decideAlerts(rows, queue, opts.appUrl);

  let sent = 0;
  let failed = 0;
  let budget = MAX_SENDS_PER_RUN;
  const work = decisions.map((d) => async () => {
    if (d.events.length === 0 || !d.row.url) {
      if (d.patch.breachedThreshold !== d.row.breachedThreshold || d.patch.redemptionHigh !== d.row.redemptionHigh) {
        await db.update(loanAlerts).set(d.patch).where(eq(loanAlerts.borrower, d.row.borrower));
      }
      return;
    }
    if (budget < d.events.length) return;
    budget -= d.events.length;
    let ok = true;
    for (const event of d.events) {
      const { body, headers } = alertPayload(d.row.url, event);
      const res = await send(d.row.url, body, headers).catch(() => null);
      if (!res || res.statusCode < 200 || res.statusCode >= 300) ok = false;
    }
    if (ok) {
      sent += d.events.length;
      await db
        .update(loanAlerts)
        .set({ ...d.patch, failures: 0, lastAlertAt: now })
        .where(eq(loanAlerts.borrower, d.row.borrower));
    } else {
      failed++;
      await db
        .update(loanAlerts)
        .set({
          failures: sql`${loanAlerts.failures} + 1`,
          disabledAt: sql`case when ${loanAlerts.failures} + 1 >= ${MAX_FAILURES} then ${now.toISOString()}::timestamptz else null end`,
        })
        .where(eq(loanAlerts.borrower, d.row.borrower));
    }
  });
  for (let i = 0; i < work.length; i += SEND_CONCURRENCY) {
    await Promise.all(work.slice(i, i + SEND_CONCURRENCY).map((w) => w()));
  }
  return { checked: rows.length, sent, failed };
}
