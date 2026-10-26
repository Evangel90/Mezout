import { NextResponse } from "next/server";
import { z } from "zod";
import { parseUnits } from "viem";
import { getDb } from "@/lib/server/db/client";
import { serverEnv } from "@/lib/server/env";
import { createInvoice, MAX_EXPIRES_IN, MIN_EXPIRES_IN } from "@/lib/server/invoices";
import { signInvoiceToken } from "@/lib/server/signInvoice";
import { apiError, requireSession } from "@/lib/server/v1";

const body = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,18})?$/, "amount must be a decimal MUSD value"),
  reference: z.string().min(1).max(200).optional(),
  ttlMinutes: z.number().int().min(MIN_EXPIRES_IN / 60).max(MAX_EXPIRES_IN / 60).default(24 * 60),
});

// Dashboard payment links. They are stored invoices like the API's, so they show in the order list and send webhooks.
export async function POST(req: Request) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  if (parseUnits(parsed.data.amount, 18) === 0n) return apiError(400, "amount must be positive");

  const row = await createInvoice(
    getDb(),
    merchant,
    { amount: parsed.data.amount, reference: parsed.data.reference, expiresIn: parsed.data.ttlMinutes * 60 },
    signInvoiceToken,
  );
  return NextResponse.json({
    id: row.id,
    orderId: row.orderId,
    expiry: String(row.expiresAt.getTime() / 1000),
    token: row.token,
    url: new URL(`/pay/${row.token}`, serverEnv.appUrl()).toString(),
  });
}
