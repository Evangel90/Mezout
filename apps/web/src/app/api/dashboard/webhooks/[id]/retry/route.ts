import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import { findEndpoint, retryDelivery } from "@/lib/server/webhookEndpoints";
import { deliverWebhooks } from "@/lib/server/sync";
import { apiError, requireSession } from "@/lib/server/v1";

const body = z.object({ delivery: z.string().uuid() });

/** Re-sends a delivery that ran out of retries. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "delivery: required");
  const db = getDb();
  if (!(await findEndpoint(db, merchant, params.id))) return apiError(404, "No such webhook endpoint");
  if (!(await retryDelivery(db, params.id, parsed.data.delivery))) return apiError(400, "Only failed deliveries can be retried");
  return NextResponse.json(await deliverWebhooks(5));
}
