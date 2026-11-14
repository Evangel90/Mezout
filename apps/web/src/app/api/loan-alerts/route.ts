import { NextResponse } from "next/server";
import { z } from "zod";
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { requireAddress, troveManagerAbi } from "@mezout/sdk";
import { publicClient } from "@/lib/server/clients";
import { serverNetwork } from "@/lib/server/network";
import { getDb } from "@/lib/server/db/client";
import { alertStatus, LoanAlertError, subscribe, unsubscribe } from "@/lib/server/loanAlerts";
import { ownershipVerifier } from "@/lib/server/ownership";
import { clientIp, rateLimited, tooManyRequests } from "@/lib/server/rateLimit";
import { allowPrivateWebhooks, webhookSender } from "@/lib/server/webhookSender";

export const dynamic = "force-dynamic";

const address = z.string().refine(isAddress, "invalid address") as unknown as z.ZodType<Address>;
const signed = z.object({
  address,
  issuedAt: z.string().max(40),
  signature: z.string().max(20_000).refine((v) => isHex(v), "invalid signature") as unknown as z.ZodType<Hex>,
});
const subscribeBody = signed.extend({
  url: z.string().max(500),
  thresholds: z.array(z.number().int()).max(3),
  redemption: z.boolean(),
});

/** Signed requests: 10 a minute per IP and 5 per 10 minutes per wallet, counted across every server instance. */
async function limit(req: Request, wallet: string) {
  return (await rateLimited(`loan-alerts:ip:${clientIp(req)}`, 10, 60_000)) || (await rateLimited(`loan-alerts:wallet:${getAddress(wallet)}`, 5, 10 * 60_000));
}

const hasLoan = async (borrower: Address) =>
  (await publicClient().readContract({
    address: requireAddress(serverNetwork(), "troveManager"),
    abi: troveManagerAbi,
    functionName: "getTroveStatus",
    args: [borrower],
  })) === 1;

/** Whether a wallet has alerts on, and which. Public like the loan itself; the alert URL is never returned. */
export async function GET(req: Request) {
  const wait = await rateLimited(`loan-alerts:read:${clientIp(req)}`, 60, 60_000);
  if (wait) return tooManyRequests(wait);
  const a = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(a)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  return NextResponse.json(await alertStatus(getDb(), a), { headers: { "cache-control": "no-store" } });
}

/** Turns alerts on, or changes them, with a signed loanAlertsSubscribeMessage. */
export async function POST(req: Request) {
  const parsed = subscribeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const wait = await limit(req, parsed.data.address);
  if (wait) return tooManyRequests(wait);
  const db = getDb();
  try {
    const verify = await ownershipVerifier(db, req, parsed.data.address);
    const allowPrivate = allowPrivateWebhooks();
    await subscribe(db, parsed.data, { verify, hasLoan, send: webhookSender(allowPrivate), allowPrivate });
    return NextResponse.json(await alertStatus(db, parsed.data.address), { status: 201 });
  } catch (err) {
    if (err instanceof LoanAlertError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

/** Turns alerts off with a signed loanAlertsUnsubscribeMessage. */
export async function DELETE(req: Request) {
  const parsed = signed.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const wait = await limit(req, parsed.data.address);
  if (wait) return tooManyRequests(wait);
  const db = getDb();
  try {
    const verify = await ownershipVerifier(db, req, parsed.data.address);
    const stopped = await unsubscribe(db, parsed.data, verify);
    return NextResponse.json({ ...(await alertStatus(db, parsed.data.address)), stopped });
  } catch (err) {
    if (err instanceof LoanAlertError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
