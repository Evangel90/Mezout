import { NextResponse } from "next/server";
import { z } from "zod";
import { getAddress, isAddress, parseUnits } from "viem";
import type { Invoice } from "@mezout/sdk";
import { randomOrderId, signInvoiceToken } from "@/lib/server/signInvoice";
import { clientIp, rateLimited } from "@/lib/server/rateLimit";

const MAX_TTL_MINUTES = 30 * 24 * 60;

const body = z.object({
  merchant: z.string().refine(isAddress, "invalid address"),
  amount: z.string().regex(/^\d+(\.\d{1,18})?$/, "amount must be a decimal MUSD value"),
  ttlMinutes: z.number().int().min(5).max(MAX_TTL_MINUTES).default(24 * 60),
});

// Dashboard quick links: unauthenticated and not stored. Integrations use the keyed /v1/invoices API.
export async function POST(req: Request) {
  if (rateLimited(`inv:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const amount = parseUnits(parsed.data.amount, 18);
  if (amount === 0n) return NextResponse.json({ error: "amount must be positive" }, { status: 400 });

  const invoice: Invoice = {
    merchant: getAddress(parsed.data.merchant),
    amount,
    fee: 0n,
    orderId: randomOrderId(),
    expiry: BigInt(Math.floor(Date.now() / 1000) + parsed.data.ttlMinutes * 60),
  };
  const token = await signInvoiceToken(invoice);
  const url = new URL(`/pay/${token}`, req.url).toString();
  return NextResponse.json({ orderId: invoice.orderId, expiry: invoice.expiry.toString(), token, url });
}
