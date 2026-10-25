import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/server/env";
import { indexerTick } from "@/lib/server/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const matches = (given: string, expected: string) =>
  given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

// Runs every 5 minutes from GitHub Actions (.github/workflows/indexer.yml) with Authorization: Bearer CRON_SECRET.
export async function GET(req: Request) {
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matches(given, serverEnv.cronSecret())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { synced, expired, webhooks } = await indexerTick();
  return NextResponse.json({
    synced: synced && { from: synced.fromBlock.toString(), to: synced.toBlock.toString(), recorded: synced.recorded },
    expired,
    webhooks,
  });
}
