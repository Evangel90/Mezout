import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db/client";
import { findRefund, refundJson } from "@/lib/server/refunds";
import { apiError, requireMerchant } from "@/lib/server/v1";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;
  const found = await findRefund(getDb(), merchant, params.id);
  if (!found) return apiError(404, "No such refund");
  return NextResponse.json(refundJson(found.refund, found.invoice?.id ?? null), { headers: { "cache-control": "no-store" } });
}
