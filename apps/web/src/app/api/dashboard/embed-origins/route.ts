import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import { getEmbedOrigins, ProfileError, setEmbedOrigins } from "@/lib/server/profile";
import { apiError, requireSession } from "@/lib/server/v1";

const body = z.object({ origins: z.array(z.string().max(2_000)).max(10) });

export async function GET(req: Request) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  return NextResponse.json({ origins: await getEmbedOrigins(getDb(), merchant) });
}

export async function PUT(req: Request) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "origins must be a list of up to 10 site URLs");
  try {
    return NextResponse.json({ origins: await setEmbedOrigins(getDb(), merchant, parsed.data.origins) });
  } catch (err) {
    if (err instanceof ProfileError) return apiError(400, err.message);
    throw err;
  }
}
