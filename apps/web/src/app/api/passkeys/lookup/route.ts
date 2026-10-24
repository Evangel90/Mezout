import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import { passkeysByCredential } from "@/lib/server/passkeys";
import { clientIp, rateLimited } from "@/lib/server/rateLimit";

const body = z.object({ credentialId: z.string().min(1).max(1024) });

// Sign-in: the browser reports which passkey the user picked; this returns its public key(s) and account address.
// Public data only. The client keeps the match whose key verifies the assertion it just made.
export async function POST(req: Request) {
  if (rateLimited(`passkey-lookup:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const rows = await passkeysByCredential(getDb(), parsed.data.credentialId);
  return NextResponse.json({
    accounts: rows.map((r) => ({ address: r.accountAddress, publicKey: r.publicKey })),
  });
}
