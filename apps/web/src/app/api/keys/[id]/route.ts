import { NextResponse } from "next/server";
import { revokeApiKey } from "@/lib/server/apiKeys";
import { getDb } from "@/lib/server/db/client";
import { apiError, requireSession } from "@/lib/server/v1";

/** Revokes a key from the dashboard. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  if (!(await revokeApiKey(getDb(), merchant, params.id))) return apiError(404, "No such key");
  return NextResponse.json({ id: params.id, object: "api_key", revoked: true });
}
