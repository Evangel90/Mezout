import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { getDb } from "@/lib/server/db/client";
import { issueApiKey, KeyRequestError, mintApiKey } from "@/lib/server/apiKeys";
import { ownershipVerifier } from "@/lib/server/ownership";
import { clientIp, rateLimited } from "@/lib/server/rateLimit";
import { readCookie, sameOrigin, SESSION_COOKIE, sessionMerchant } from "@/lib/server/sessions";

const body = z.object({
  address: z.string().refine(isAddress, "invalid address") as unknown as z.ZodType<Address>,
  issuedAt: z.string(),
  signature: z.string().refine((v) => isHex(v), "invalid signature") as unknown as z.ZodType<Hex>,
});

// A signed-in dashboard session can mint a key directly. Without one, the merchant signs keyRequestMessage
// (see ownershipVerifier for the accepted signatures).
export async function POST(req: Request) {
  if (rateLimited(`keys:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
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
