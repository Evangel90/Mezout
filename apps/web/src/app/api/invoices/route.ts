import { NextResponse } from "next/server";
import { z } from "zod";
import { bytesToHex, getAddress, isAddress, parseUnits } from "viem";
import { encodeSignedInvoice, invoiceTypes, routerDomain, type Invoice } from "@mezout/sdk";
import { invoiceSigner } from "@/lib/server/clients";
import { serverEnv } from "@/lib/server/env";
import { clientIp, rateLimited } from "@/lib/server/rateLimit";

const MAX_TTL_MINUTES = 30 * 24 * 60;

const body = z.object({
  merchant: z.string().refine(isAddress, "invalid address"),
  amount: z.string().regex(/^\d+(\.\d{1,18})?$/, "amount must be a decimal MUSD value"),
  ttlMinutes: z.number().int().min(5).max(MAX_TTL_MINUTES).default(24 * 60),
});

// M1: unauthenticated; anyone may create an invoice that pays any merchant address. API keys arrive in M3.
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
    orderId: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    expiry: BigInt(Math.floor(Date.now() / 1000) + parsed.data.ttlMinutes * 60),
  };
  const signature = await invoiceSigner().signTypedData({
    domain: routerDomain(serverEnv.router()),
    types: invoiceTypes,
    primaryType: "Invoice",
    message: invoice,
  });
  const token = encodeSignedInvoice({ invoice, signature });
  const url = new URL(`/pay/${token}`, req.url).toString();
  return NextResponse.json({ orderId: invoice.orderId, expiry: invoice.expiry.toString(), token, url });
}
