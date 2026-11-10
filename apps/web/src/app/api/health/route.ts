import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { publicClient, relayerClient } from "@/lib/server/clients";
import { getDb } from "@/lib/server/db/client";
import { serverEnv } from "@/lib/server/env";
import { readCursor } from "@/lib/server/indexer";

export const dynamic = "force-dynamic";

/** The scheduled run is every 5 minutes; three missed runs means the scheduler or the indexer is down. */
const MAX_INDEX_AGE_S = 15 * 60;

// Public status. Answers 503 when something needs an operator, so an uptime monitor can alert on it — including
// when the scheduler itself stops calling /api/cron, which no alert sent from that job could report.
export async function GET() {
  const client = publicClient();
  const relayer = relayerClient().account.address;
  const [chainId, balance, block, cursor] = await Promise.all([
    client.getChainId(),
    client.getBalance({ address: relayer }),
    client.getBlockNumber(),
    readCursor(getDb()).catch(() => null),
  ]);
  const indexedAgo = cursor ? Math.round((Date.now() - cursor.updatedAt.getTime()) / 1000) : null;
  const problems: string[] = [];
  if (balance < serverEnv.relayerMinBalanceWei()) problems.push("relayer balance low");
  if (indexedAgo === null || indexedAgo > MAX_INDEX_AGE_S) problems.push("indexer stale");
  return NextResponse.json(
    {
      status: problems.length ? "degraded" : "ok",
      problems,
      chainId,
      block: block.toString(),
      indexedBlock: cursor ? String(cursor.block) : null,
      indexedSecondsAgo: indexedAgo,
      router: serverEnv.router(),
      relayer,
      relayerBalanceBTC: formatEther(balance),
    },
    { status: problems.length ? 503 : 200 },
  );
}
