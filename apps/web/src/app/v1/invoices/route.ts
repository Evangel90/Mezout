import { NextResponse } from "next/server";
import { z } from "zod";
import { parseUnits } from "viem";
import { getDb } from "@/lib/server/db/client";
import { serverEnv } from "@/lib/server/env";
import {
  createInvoice,
  DEFAULT_EXPIRES_IN,
  invoiceJson,
  listInvoices,
  MAX_EXPIRES_IN,
  MIN_EXPIRES_IN,
} from "@/lib/server/invoices";
import { signInvoiceToken } from "@/lib/server/signInvoice";
import { withIdempotency } from "@/lib/server/idempotency";
import { apiError, parseJson, requireMerchant } from "@/lib/server/v1";

function isReturnUrl(v: string): boolean {
  try {
    const url = new URL(v);
    if (url.username || url.password) return false;
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

const body = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,18})?$/, "amount must be a decimal string, e.g. \"25.00\"")
    .refine((v) => parseUnits(v, 18) > 0n, "amount must be positive"),
  currency: z.literal("MUSD").default("MUSD"),
  reference: z.string().min(1).max(200).optional(),
  success_url: z
    .string()
    .max(2000)
    .refine(isReturnUrl, "success_url must be an https URL (http is accepted only for localhost)")
    .optional(),
  expires_in: z.number().int().min(MIN_EXPIRES_IN).max(MAX_EXPIRES_IN).default(DEFAULT_EXPIRES_IN),
});

export async function POST(req: Request) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;

  const raw = await req.text();
  const db = getDb();
  return withIdempotency(db, req, merchant, raw, async () => {
    const parsed = body.safeParse(parseJson(raw));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return apiError(400, issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request");
    }
    const { amount, reference, success_url, expires_in } = parsed.data;
    const row = await createInvoice(db, merchant, { amount, reference, successUrl: success_url, expiresIn: expires_in }, signInvoiceToken);
    return NextResponse.json(invoiceJson({ row, payment: null, refunded: 0n }, merchant, serverEnv.appUrl()), { status: 201 });
  });
}

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  starting_after: z.string().optional(),
});

/** Lists the merchant's invoices, newest first. Page with starting_after=<last id>. */
export async function GET(req: Request) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;
  const parsed = listQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return apiError(400, "limit must be 1 to 100");
  const { limit, starting_after } = parsed.data;
  const views = await listInvoices(getDb(), merchant, { limit: limit + 1, startingAfter: starting_after });
  if (!views) return apiError(400, "starting_after is not one of your invoices");
  return NextResponse.json(
    {
      object: "list",
      data: views.slice(0, limit).map((v) => invoiceJson(v, merchant, serverEnv.appUrl())),
      has_more: views.length > limit,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
