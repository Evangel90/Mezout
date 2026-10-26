import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db/client";
import { cancelRefund, findRefund, refundJson, RefundError } from "@/lib/server/refunds";
import { apiError, requireMerchant } from "@/lib/server/v1";

/** Cancels a pending refund request. A refund already sent from the payout address cannot be canceled. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;
  const db = getDb();
  try {
    const refund = await cancelRefund(db, merchant, params.id);
    const found = await findRefund(db, merchant, refund.id);
    return NextResponse.json(refundJson(refund, found?.invoice?.id ?? null));
  } catch (err) {
    if (err instanceof RefundError) return apiError(err.status, err.message);
    throw err;
  }
}
