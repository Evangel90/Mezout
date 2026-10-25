import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import { serverEnv } from "@/lib/server/env";
import { activeEndpoints, createEndpoint, EndpointError, endpointJson } from "@/lib/server/webhookEndpoints";
import { allowPrivateWebhooks } from "@/lib/server/webhookSender";
import { apiError, requireMerchant } from "@/lib/server/v1";

const body = z.object({ url: z.string().min(1) });

/** Adds an endpoint. The response carries its signing secret (whsec_…); the dashboard can show it again. */
export async function POST(req: Request) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "url: required");
  try {
    const { endpoint, secret } = await createEndpoint(
      getDb(),
      merchant,
      parsed.data.url,
      serverEnv.webhookSigningSecret(),
      allowPrivateWebhooks(),
    );
    return NextResponse.json(endpointJson(endpoint, secret), { status: 201 });
  } catch (err) {
    if (err instanceof EndpointError) return apiError(400, err.message);
    throw err;
  }
}

export async function GET(req: Request) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;
  const endpoints = await activeEndpoints(getDb(), merchant);
  return NextResponse.json(
    { object: "list", data: endpoints.map((e) => endpointJson(e)), has_more: false },
    { headers: { "cache-control": "no-store" } },
  );
}
