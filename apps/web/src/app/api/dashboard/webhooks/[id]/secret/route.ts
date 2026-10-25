import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db/client";
import { serverEnv } from "@/lib/server/env";
import { findEndpoint } from "@/lib/server/webhookEndpoints";
import { endpointSecret } from "@/lib/server/webhooks";
import { apiError, requireSession } from "@/lib/server/v1";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  if (!(await findEndpoint(getDb(), merchant, params.id))) return apiError(404, "No such webhook endpoint");
  return NextResponse.json(
    { secret: endpointSecret(serverEnv.webhookSigningSecret(), params.id) },
    { headers: { "cache-control": "no-store" } },
  );
}
