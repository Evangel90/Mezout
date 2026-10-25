import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db/client";
import { endpointAttempts, findEndpoint } from "@/lib/server/webhookEndpoints";
import { apiError, requireSession } from "@/lib/server/v1";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  const db = getDb();
  if (!(await findEndpoint(db, merchant, params.id))) return apiError(404, "No such webhook endpoint");
  return NextResponse.json({ attempts: await endpointAttempts(db, params.id) }, { headers: { "cache-control": "no-store" } });
}
