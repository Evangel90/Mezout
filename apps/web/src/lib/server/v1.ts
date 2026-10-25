import "server-only";
import { NextResponse } from "next/server";
import { authenticate, type Merchant } from "./apiKeys";
import { getDb } from "./db/client";
import { rateLimited } from "./rateLimit";
import { readCookie, sameOrigin, SESSION_COOKIE, sessionMerchant } from "./sessions";

export const apiError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/**
 * Authenticates a /v1 request with an API key, or with the dashboard's session cookie, and applies the per-merchant
 * rate limit.
 */
export async function requireMerchant(req: Request): Promise<Merchant | NextResponse> {
  const db = getDb();
  const authorization = req.headers.get("authorization");
  let merchant: Merchant | null;
  if (authorization) {
    merchant = await authenticate(db, authorization);
  } else {
    merchant = await sessionMerchant(db, readCookie(req, SESSION_COOKIE));
    if (merchant && !sameOrigin(req)) return apiError(403, "Cross-site request");
  }
  if (!merchant) {
    const res = apiError(401, "Missing or invalid API key. Send Authorization: Bearer mzk_test_…");
    res.headers.set("WWW-Authenticate", "Bearer");
    return res;
  }
  if (rateLimited(`v1:${merchant.id}`, 120, 60_000)) return apiError(429, "Too many requests");
  return merchant;
}

/** Same as requireMerchant, but only for the signed-in dashboard (never an API key). */
export async function requireSession(req: Request): Promise<Merchant | NextResponse> {
  const merchant = await sessionMerchant(getDb(), readCookie(req, SESSION_COOKIE));
  if (!merchant) return apiError(401, "Sign in to the dashboard first");
  if (!sameOrigin(req)) return apiError(403, "Cross-site request");
  if (rateLimited(`dash:${merchant.id}`, 120, 60_000)) return apiError(429, "Too many requests");
  return merchant;
}
