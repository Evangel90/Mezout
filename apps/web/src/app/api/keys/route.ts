import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { getDb } from "@/lib/server/db/client";
import { issueApiKey, KeyRequestError, listApiKeys, mintApiKey } from "@/lib/server/apiKeys";
import { ownershipVerifier } from "@/lib/server/ownership";
import { clientIp, rateLimited, tooManyRequests } from "@/lib/server/rateLimit";
import { readCookie, sameOrigin, SESSION_COOKIE, sessionMerchant } from "@/lib/server/sessions";
import { requireSession } from "@/lib/server/v1";

const body = z.object({
  address: z.string().refine(isAddress, "invalid address") as unknown as z.ZodType<Address>,
  issuedAt: z.string(),
  signature: z.string().refine((v) => isHex(v), "invalid signature") as unknown as z.ZodType<Hex>,
});

// A signed-in dashboard session can mint a key directly. Without one, the merchant signs keyRequestMessage
// (see ownershipVerifier for the accepted signatures).
export async function POST(req: Request) {
  const wait = await rateLimited(`keys:${clientIp(req)}`, 10, 60_000);
  if (wait) return tooManyRequests(wait);
  const db = getDb();
  try {
    const merchant = await sessionMerchant(db, readCookie(req, SESSION_COOKIE));
    if (merchant) {
      if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request" }, { status: 403 });
      const { key, prefix } = await mintApiKey(db, merchant, `session:${randomBytes(16).toString("hex")}`);
      return NextResponse.json({ key, prefix, merchant: merchant.payoutAddress }, { status: 201 });
    }

    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const verify = await ownershipVerifier(db, req, parsed.data.address);
    const { key, prefix, merchant: signer } = await issueApiKey(db, parsed.data, verify);
    return NextResponse.json({ key, prefix, merchant: signer.payoutAddress }, { status: 201 });
  } catch (err) {
    if (err instanceof KeyRequestError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

/** The signed-in merchant's active keys (prefixes only). */
export async function GET(req: Request) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  return NextResponse.json(
    { object: "list", data: await listApiKeys(getDb(), merchant), has_more: false },
    { headers: { "cache-control": "no-store" } },
  );
}
