import { NextResponse } from "next/server";
import { z } from "zod";
import { parseUnits } from "viem";
import { getDb } from "@/lib/server/db/client";
import {
  createInvoice,
  DEFAULT_EXPIRES_IN,
  invoiceJson,
  MAX_EXPIRES_IN,
  MIN_EXPIRES_IN,
} from "@/lib/server/invoices";
import { signInvoiceToken } from "@/lib/server/signInvoice";
import { apiError, requireMerchant } from "@/lib/server/v1";

const body = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,18})?$/, "amount must be a decimal string, e.g. \"25.00\"")
    .refine((v) => parseUnits(v, 18) > 0n, "amount must be positive"),
  currency: z.literal("MUSD").default("MUSD"),
  reference: z.string().min(1).max(200).optional(),
  expires_in: z.number().int().min(MIN_EXPIRES_IN).max(MAX_EXPIRES_IN).default(DEFAULT_EXPIRES_IN),
});

export async function POST(req: Request) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return apiError(400, issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request");
  }
  const { amount, reference, expires_in } = parsed.data;
  const row = await createInvoice(getDb(), merchant, { amount, reference, expiresIn: expires_in }, signInvoiceToken);
  return NextResponse.json(invoiceJson(row, merchant, "pending", req.url), { status: 201 });
}
