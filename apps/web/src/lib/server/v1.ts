import "server-only";
import { NextResponse } from "next/server";
import { authenticate, type Merchant } from "./apiKeys";
import { getDb } from "./db/client";
import { rateLimited } from "./rateLimit";

export const apiError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Authenticates a /v1 request and applies the per-merchant rate limit. */
export async function requireMerchant(req: Request): Promise<Merchant | NextResponse> {
  const merchant = await authenticate(getDb(), req.headers.get("authorization"));
  if (!merchant) {
    const res = apiError(401, "Missing or invalid API key. Send Authorization: Bearer mzk_test_…");
    res.headers.set("WWW-Authenticate", "Bearer");
    return res;
  }
  if (rateLimited(`v1:${merchant.id}`, 120, 60_000)) return apiError(429, "Too many requests");
  return merchant;
}
