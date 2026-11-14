import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cronFailedAlert, failedDeliveriesAlert, relayerBalanceAlert, sendAlerts } from "@/lib/server/alerts";
import { publicClient, relayerClient } from "@/lib/server/clients";
import { getDb } from "@/lib/server/db/client";
import { serverEnv } from "@/lib/server/env";
import { evaluateLoanAlerts } from "@/lib/server/loanAlerts";
import { indexerTick } from "@/lib/server/sync";
import { allowPrivateWebhooks, webhookSender } from "@/lib/server/webhookSender";
import { getRedemptionQueue } from "@mezout/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const matches = (given: string, expected: string) =>
  given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

// Called every 5 minutes by an external scheduler (cron-job.org), with GitHub Actions as a backstop
// (.github/workflows/indexer.yml), both sending Authorization: Bearer CRON_SECRET.
export async function GET(req: Request) {
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matches(given, serverEnv.cronSecret())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const url = serverEnv.alertWebhookUrl();

  let tick;
  try {
    tick = await indexerTick();
  } catch (err) {
    console.error("scheduled run failed", err);
    await sendAlerts([cronFailedAlert(err)], { db, url }).catch(() => {});
    return NextResponse.json({ error: "Scheduled run failed" }, { status: 500 });
  }

  const alerts = await Promise.all([
    publicClient()
      .getBalance({ address: relayerClient().account.address })
      .then((balance) => relayerBalanceAlert(balance, serverEnv.relayerMinBalanceWei())),
    failedDeliveriesAlert(db),
  ]).catch((err) => {
    console.error("alert checks failed", err);
    return [];
  });
  const [alerted, loanAlerts] = await Promise.all([
    sendAlerts(alerts, { db, url }),
    // Borrowers' opt-in alerts: one batched read of Mezo's loans per run, and only when someone has subscribed.
    evaluateLoanAlerts(db, () => getRedemptionQueue(publicClient()), webhookSender(allowPrivateWebhooks()), {
      appUrl: serverEnv.appUrl(),
    }).catch((err) => {
      console.error("loan alert checks failed", err);
      return { error: true };
    }),
  ]);

  const { synced, expired, webhooks } = tick;
  return NextResponse.json({
    synced: synced && { from: synced.fromBlock.toString(), to: synced.toBlock.toString(), recorded: synced.recorded },
    expired,
    webhooks,
    alerted,
    loanAlerts,
  });
}
