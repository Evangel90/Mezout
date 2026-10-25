import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { signInMessage } from "@mezout/sdk";
import { sha256, verifySignedRequest, type Merchant, type SignedRequest, type VerifySignature } from "./apiKeys";
import type { Db } from "./db/client";
import { merchants, sessions } from "./db/schema";

export const SESSION_COOKIE = "mezout_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Opens a dashboard session for a merchant who signed signInMessage. Returns the cookie token, shown only here. */
export async function createSession(
  db: Db,
  req: SignedRequest,
  verify: VerifySignature,
  now = Date.now(),
): Promise<{ token: string; merchant: Merchant; expiresAt: Date }> {
  const { merchant, requestHash } = await verifySignedRequest(db, req, signInMessage, verify, now);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS);
  const inserted = await db
    .insert(sessions)
    .values({ merchantId: merchant.id, tokenHash: sha256(token), requestHash, expiresAt })
    .onConflictDoNothing({ target: sessions.requestHash })
    .returning({ id: sessions.id });
  if (inserted.length === 0) throw new SessionError("This sign-in was already used. Sign in again.");
  return { token, merchant, expiresAt };
}

export class SessionError extends Error {}

export async function sessionMerchant(db: Db, token: string | undefined, now = Date.now()): Promise<Merchant | null> {
  if (!token) return null;
  const [row] = await db
    .select({ merchant: merchants })
    .from(sessions)
    .innerJoin(merchants, eq(sessions.merchantId, merchants.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date(now))));
  return row?.merchant ?? null;
}

export async function endSession(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

/** Reads one cookie from a request. */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/**
 * Cookie-authenticated requests that change state must come from Mezout's own pages. The cookie is SameSite=Strict
 * already; this also rejects a request whose Origin is another site.
 */
export function sameOrigin(req: Request): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    // The same host passkeys are checked against (relyingParty).
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
