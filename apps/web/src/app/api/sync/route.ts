import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { clientIp, rateLimited } from "@/lib/server/rateLimit";
import { deliverWebhooks, syncNow } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

// The checkout calls this right after a payment confirms, so the invoice is marked paid and its webhook goes out in
// seconds rather than at the next scheduled run. It only reads public chain data, so it needs no auth.
export async function POST(req: Request) {
  if (rateLimited(`sync:${clientIp(req)}`, 6, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const synced = await syncNow(1);
  if (synced?.recorded) waitUntil(deliverWebhooks(10).catch((err) => console.error("webhook delivery failed", err)));
  return NextResponse.json({ recorded: synced?.recorded ?? 0, block: synced?.toBlock.toString() ?? null });
}
