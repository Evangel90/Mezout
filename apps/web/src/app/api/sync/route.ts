import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { publicClient } from "@/lib/server/clients";
import { clientIp, rateLimited, tooManyRequests } from "@/lib/server/rateLimit";
import { deliverWebhooks, syncNow } from "@/lib/server/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const body = z.object({ block: z.string().regex(/^\d+$/).transform(BigInt).optional() }).default({});

// The checkout calls this right after a payment confirms, with the receipt's block, so the invoice is marked paid and
// its webhook goes out in seconds rather than at the next scheduled run. The indexer waits one block, so this first
// waits (briefly) for the block after the payment. It only reads public chain data, so it needs no auth.
export async function POST(req: Request) {
  const wait = await rateLimited(`sync:${clientIp(req)}`, 6, 60_000);
  if (wait) return tooManyRequests(wait);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  const block = parsed.success ? parsed.data.block : undefined;
  if (block !== undefined) {
    const client = publicClient();
    for (let i = 0; i < 10 && (await client.getBlockNumber()) <= block; i++) await new Promise((r) => setTimeout(r, 1_000));
  }
  const synced = await syncNow(1);
  if (synced?.recorded) waitUntil(deliverWebhooks(10).catch((err) => console.error("webhook delivery failed", err)));
  return NextResponse.json({ recorded: synced?.recorded ?? 0, block: synced?.toBlock.toString() ?? null });
}
