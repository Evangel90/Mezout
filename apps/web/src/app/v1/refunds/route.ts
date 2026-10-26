import { NextResponse } from "next/server";
import { z } from "zod";
import { parseUnits } from "viem";
import { getDb } from "@/lib/server/db/client";
import { refundJson, RefundError, requestRefund } from "@/lib/server/refunds";
import { withIdempotency } from "@/lib/server/idempotency";
import { apiError, parseJson, requireMerchant } from "@/lib/server/v1";

const body = z.object({
  invoice: z.string().min(1),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,18})?$/, "amount must be a decimal string, e.g. \"5.00\"")
    .optional(),
  reason: z.string().min(1).max(200).optional(),
});

/**
 * Requests a refund of a paid invoice (the full remaining amount unless `amount` is given). Mezout never holds funds,
 * so the refund is pending until the merchant sends it from the dashboard; refund.completed follows.
 */
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
    const { invoice, amount, reason } = parsed.data;
    try {
      const { refund, invoiceId } = await requestRefund(db, merchant, {
        invoiceId: invoice,
        amount: amount === undefined ? undefined : parseUnits(amount, 18),
        reason,
      });
      return NextResponse.json(refundJson(refund, invoiceId), { status: 201 });
    } catch (err) {
      if (err instanceof RefundError) return apiError(err.status, err.message);
      throw err;
    }
  });
}
