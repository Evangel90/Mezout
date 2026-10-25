import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { KeyRequestError } from "@/lib/server/apiKeys";
import { getDb } from "@/lib/server/db/client";
import { ownershipVerifier } from "@/lib/server/ownership";
import { clientIp, rateLimited } from "@/lib/server/rateLimit";
import {
  createSession,
  endSession,
  readCookie,
  sameOrigin,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  SessionError,
  sessionMerchant,
} from "@/lib/server/sessions";

const body = z.object({
  address: z.string().refine(isAddress, "invalid address") as unknown as z.ZodType<Address>,
  issuedAt: z.string(),
  signature: z.string().refine((v) => isHex(v), "invalid signature") as unknown as z.ZodType<Hex>,
});

const cookie = (value: string, maxAgeSeconds: number) =>
  [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");

/** The signed-in merchant, or 401. */
export async function GET(req: Request) {
  const merchant = await sessionMerchant(getDb(), readCookie(req, SESSION_COOKIE));
  if (!merchant) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ merchant: merchant.payoutAddress }, { headers: { "cache-control": "no-store" } });
}

/** Signs in with a signed signInMessage and sets the session cookie. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request" }, { status: 403 });
  if (rateLimited(`session:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = getDb();
  try {
    const verify = await ownershipVerifier(db, req, parsed.data.address);
    const { token, merchant } = await createSession(db, parsed.data, verify);
    const res = NextResponse.json({ merchant: merchant.payoutAddress }, { status: 201 });
    res.headers.set("set-cookie", cookie(token, SESSION_TTL_MS / 1000));
    return res;
  } catch (err) {
    if (err instanceof KeyRequestError || err instanceof SessionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request" }, { status: 403 });
  await endSession(getDb(), readCookie(req, SESSION_COOKIE));
  const res = NextResponse.json({ ok: true });
  res.headers.set("set-cookie", cookie("", 0));
  return res;
}
