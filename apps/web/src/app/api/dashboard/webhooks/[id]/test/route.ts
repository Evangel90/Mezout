import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db/client";
import { findEndpoint } from "@/lib/server/webhookEndpoints";
import { recordEvent } from "@/lib/server/webhooks";
import { deliverWebhooks } from "@/lib/server/sync";
import { apiError, requireSession } from "@/lib/server/v1";

/** Sends a `ping` event to one endpoint now and returns the delivery result. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  const db = getDb();
  const endpoint = await findEndpoint(db, merchant, params.id);
  if (!endpoint) return apiError(404, "No such webhook endpoint");
  const id = await recordEvent(
    db,
    merchant.id,
    "ping",
    `ping:${randomBytes(12).toString("hex")}`,
    { object: "ping", message: "Test event from the Mezout dashboard", endpoint: endpoint.id },
    { onlyEndpoint: endpoint.id },
  );
  const result = await deliverWebhooks(5);
  return NextResponse.json({ event: id, ...result });
}
