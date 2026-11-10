import "server-only";
import { sql } from "drizzle-orm";
import { formatEther } from "viem";
import type { Db } from "./db/client";
import { rateLimited } from "./rateLimit";

/** An operator alert. `key` and `windowMs` limit it to one message per window, however often the check runs. */
export type Alert = { key: string; windowMs: number; text: string };

export const HOUR = 60 * 60 * 1000;

/** The relayer pays every customer's gas; when it runs dry, gasless payments and withdrawals stop. */
export function relayerBalanceAlert(balanceWei: bigint, minWei: bigint): Alert | null {
  if (balanceWei >= minWei) return null;
  return {
    key: "relayer-low",
    windowMs: 6 * HOUR,
    text: `Relayer balance is ${formatEther(balanceWei)} BTC, below the ${formatEther(minWei)} BTC minimum. Top it up or gasless payments will stop.`,
  };
}

/** Webhook deliveries that ran out of retries within the lookback, so a merchant missed an event for good. */
export async function failedDeliveriesAlert(db: Db, now = Date.now(), lookbackMs = HOUR): Promise<Alert | null> {
  const since = new Date(now - lookbackMs).toISOString();
  const { rows } = (await db.execute(sql`
    select count(*)::int as failed, string_agg(distinct e.url, ' ') as urls
    from webhook_deliveries d
    join webhook_endpoints e on e.id = d.endpoint_id
    where d.status = 'failed'
      and (select max(a.created_at) from webhook_attempts a where a.delivery_id = d.id) > ${since}::timestamptz`)) as unknown as {
    rows: { failed: number; urls: string | null }[];
  };
  const failed = Number(rows[0]?.failed ?? 0);
  if (failed === 0) return null;
  const hosts = [...new Set((rows[0].urls ?? "").split(" ").filter(Boolean).map(hostOf))].slice(0, 5);
  return {
    key: "webhooks-failed",
    windowMs: HOUR,
    text: `${failed} webhook deliver${failed === 1 ? "y" : "ies"} ran out of retries in the last hour (${hosts.join(", ")}). Those merchants may have unfulfilled orders.`,
  };
}

/** The scheduled run itself failed: payments may not be indexed and webhooks not sent until it recovers. */
export function cronFailedAlert(err: unknown): Alert {
  const message = err instanceof Error ? err.message : String(err);
  return { key: "cron-failed", windowMs: HOUR, text: `Scheduled run failed: ${message.slice(0, 300)}` };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid url";
  }
}

/** Discord expects `content`, Slack and most others `text`. */
export function alertBody(url: string, text: string): string {
  const message = `Mezout alert: ${text}`;
  return JSON.stringify(hostOf(url).endsWith("discord.com") ? { content: message } : { text: message });
}

/**
 * Posts each alert to ALERT_WEBHOOK_URL, at most once per alert window across every server instance. Without a URL
 * the alerts are only logged. Returns the keys that were sent.
 */
export async function sendAlerts(
  alerts: (Alert | null)[],
  opts: { db: Db; url: string | undefined; now?: number; fetchFn?: typeof fetch },
): Promise<string[]> {
  const sent: string[] = [];
  for (const alert of alerts) {
    if (!alert) continue;
    console.warn(`alert ${alert.key}: ${alert.text}`);
    if (!opts.url) continue;
    if (await rateLimited(`alert:${alert.key}`, 1, alert.windowMs, opts.db, opts.now)) continue;
    try {
      const res = await (opts.fetchFn ?? fetch)(opts.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: alertBody(opts.url, alert.text),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sent.push(alert.key);
    } catch (err) {
      console.error(`alert ${alert.key} could not be sent`, err);
    }
  }
  return sent;
}
