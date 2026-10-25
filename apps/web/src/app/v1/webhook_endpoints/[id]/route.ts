import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db/client";
import { disableEndpoint } from "@/lib/server/webhookEndpoints";
import { apiError, requireMerchant } from "@/lib/server/v1";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;
  if (!(await disableEndpoint(getDb(), merchant, params.id))) return apiError(404, "No such webhook endpoint");
  return NextResponse.json({ id: params.id, object: "webhook_endpoint", deleted: true });
}
