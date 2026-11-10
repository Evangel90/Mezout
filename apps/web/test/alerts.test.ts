import { parseEther } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alertBody,
  cronFailedAlert,
  failedDeliveriesAlert,
  HOUR,
  relayerBalanceAlert,
  sendAlerts,
} from "@/lib/server/alerts";
import type { Db } from "@/lib/server/db/client";
import { webhookAttempts, webhookDeliveries, webhookEvents } from "@/lib/server/db/schema";
import { testDb } from "./db";
import { makeEndpoint, makeMerchant } from "./fixtures";

const ok = () => vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));

describe("alerts", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });
  const t = Date.parse("2026-11-10T12:00:00.000Z");

  it("flags a relayer balance below the minimum only", () => {
    expect(relayerBalanceAlert(parseEther("0.0005"), parseEther("0.0001"))).toBeNull();
    expect(relayerBalanceAlert(parseEther("0.0001"), parseEther("0.0001"))).toBeNull();
    const alert = relayerBalanceAlert(parseEther("0.00005"), parseEther("0.0001"));
    expect(alert?.key).toBe("relayer-low");
    expect(alert?.text).toContain("0.00005 BTC");
  });

  it("reports deliveries that ran out of retries within the last hour", async () => {
    const merchant = await makeMerchant(db);
    const endpoint = await makeEndpoint(db, merchant, "https://shop.example/hook");
    const failedAt = async (id: string, status: string, at: number) => {
      await db.insert(webhookEvents).values({ id, merchantId: merchant.id, type: "invoice.paid", dedupeKey: id, data: {} });
      const [d] = await db
        .insert(webhookDeliveries)
        .values({ eventId: id, endpointId: endpoint.id, status, attempts: 1 })
        .returning();
      await db.insert(webhookAttempts).values({ deliveryId: d.id, attempt: 1, statusCode: 500, durationMs: 10, createdAt: new Date(at) });
    };
    expect(await failedDeliveriesAlert(db, t)).toBeNull();
    await failedAt("evt_old", "failed", t - 2 * HOUR);
    await failedAt("evt_pending", "pending", t - 60_000);
    expect(await failedDeliveriesAlert(db, t)).toBeNull();
    await failedAt("evt_new", "failed", t - 60_000);
    const alert = await failedDeliveriesAlert(db, t);
    expect(alert?.text).toContain("1 webhook delivery");
    expect(alert?.text).toContain("shop.example");
  });

  it("formats bodies for Discord and Slack", () => {
    expect(JSON.parse(alertBody("https://discord.com/api/webhooks/1/x", "hi"))).toEqual({ content: "Mezout alert: hi" });
    expect(JSON.parse(alertBody("https://hooks.slack.com/services/x", "hi"))).toEqual({ text: "Mezout alert: hi" });
  });

  it("sends each alert once per window and only logs without a URL", async () => {
    const alert = cronFailedAlert(new Error("rpc down"));
    const fetchFn = ok();
    const url = "https://hooks.slack.com/services/x";
    expect(await sendAlerts([alert, null], { db, url, now: t, fetchFn })).toEqual(["cron-failed"]);
    expect(await sendAlerts([alert], { db, url, now: t + 60_000, fetchFn })).toEqual([]);
    expect(await sendAlerts([alert], { db, url, now: t + HOUR, fetchFn })).toEqual(["cron-failed"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[0][1]?.body)).toContain("rpc down");

    const noUrl = ok();
    expect(await sendAlerts([relayerBalanceAlert(0n, 1n)], { db, url: undefined, now: t, fetchFn: noUrl })).toEqual([]);
    expect(noUrl).not.toHaveBeenCalled();
  });

  it("does not throw when the alert endpoint fails", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 500 }));
    const sent = await sendAlerts([cronFailedAlert("x")], { db, url: "https://hooks.slack.com/x", now: t, fetchFn });
    expect(sent).toEqual([]);
  });
});
