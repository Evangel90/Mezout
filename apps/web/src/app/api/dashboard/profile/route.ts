import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import { ProfileError, setBusinessName } from "@/lib/server/profile";
import { apiError, requireSession } from "@/lib/server/v1";

const body = z.object({ business_name: z.string().max(256) });

/** Sets (or, with an empty string, clears) the business name customers see at checkout. */
export async function PUT(req: Request) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "business_name: required");
  try {
    return NextResponse.json({ business_name: await setBusinessName(getDb(), merchant, parsed.data.business_name) });
  } catch (err) {
    if (err instanceof ProfileError) return apiError(400, err.message);
    throw err;
  }
}
