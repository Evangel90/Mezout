import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getAddress, hashMessage, type Address, type Hex } from "viem";
import { keyRequestMessage } from "@mezout/sdk";
import type { Db } from "./db/client";
import { apiKeys, merchants } from "./db/schema";

export const KEY_PREFIX = "mzk_test_";
export const REQUEST_TTL_MS = 5 * 60_000;
export const MAX_ACTIVE_KEYS = 5;

export type Merchant = typeof merchants.$inferSelect;
export type VerifySignature = (args: { address: Address; message: string; signature: Hex }) => Promise<boolean>;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class KeyRequestError extends Error {}

export type SignedRequest = { address: Address; issuedAt: string; signature: Hex };

/**
 * Checks a merchant's signed, timestamped request (an API key or a dashboard sign-in) and returns the merchant,
 * creating its row on first use, plus the replay key: the hash of the signed message, not of the signature, since
 * ECDSA signatures can be re-encoded.
 */
export async function verifySignedRequest(
  db: Db,
  req: SignedRequest,
  buildMessage: (address: Address, issuedAt: string) => string,
  verify: VerifySignature,
  now = Date.now(),
): Promise<{ merchant: Merchant; requestHash: Hex }> {
  const issued = Date.parse(req.issuedAt);
  if (Number.isNaN(issued) || new Date(issued).toISOString() !== req.issuedAt) {
    throw new KeyRequestError("issuedAt must be an ISO 8601 UTC timestamp");
  }
  if (issued > now + 60_000 || now - issued > REQUEST_TTL_MS) {
    throw new KeyRequestError("This request has expired. Sign a new one.");
  }
  const address = getAddress(req.address);
  const message = buildMessage(address, req.issuedAt);
  if (!(await verify({ address, message, signature: req.signature }))) {
    throw new KeyRequestError("The signature does not match the payout address.");
  }

  await db.insert(merchants).values({ payoutAddress: address }).onConflictDoNothing();
  const [merchant] = await db.select().from(merchants).where(eq(merchants.payoutAddress, address));
  return { merchant, requestHash: hashMessage(message) };
}

/** Issues a key to a merchant who signed keyRequestMessage. */
export async function issueApiKey(
  db: Db,
  req: SignedRequest,
  verify: VerifySignature,
  now = Date.now(),
): Promise<{ key: string; prefix: string; merchant: Merchant }> {
  const { merchant, requestHash } = await verifySignedRequest(db, req, keyRequestMessage, verify, now);
  return { ...(await mintApiKey(db, merchant, requestHash)), merchant };
}

/** Mints a key for a merchant already proven to control its payout address. requestHash makes the call single-use. */
export async function mintApiKey(db: Db, merchant: Merchant, requestHash: string): Promise<{ key: string; prefix: string }> {
  const active = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.merchantId, merchant.id), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_ACTIVE_KEYS) {
    throw new KeyRequestError(`A merchant can hold at most ${MAX_ACTIVE_KEYS} active keys.`);
  }

  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  const prefix = key.slice(0, KEY_PREFIX.length + 6);
  const inserted = await db
    .insert(apiKeys)
    .values({ merchantId: merchant.id, prefix, keyHash: sha256(key), requestHash })
    .onConflictDoNothing({ target: apiKeys.requestHash })
    .returning({ id: apiKeys.id });
  if (inserted.length === 0) throw new KeyRequestError("This signed request was already used.");
  return { key, prefix };
}

/** A merchant's active keys, oldest first. Only the prefix of each key is kept, so this never shows a full key. */
export async function listApiKeys(db: Db, merchant: Merchant) {
  const rows = await db
    .select({ id: apiKeys.id, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.merchantId, merchant.id), isNull(apiKeys.revokedAt)))
    .orderBy(apiKeys.createdAt);
  return rows.map((r) => ({ id: r.id, object: "api_key", prefix: r.prefix, created_at: r.createdAt.toISOString() }));
}

/** Revokes one of the merchant's keys. Requests with it fail with 401 from then on. */
export async function revokeApiKey(db: Db, merchant: Merchant, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const rows = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.merchantId, merchant.id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

/** Resolves `Authorization: Bearer mzk_test_…` to its merchant, or null. */
export async function authenticate(db: Db, authorization: string | null): Promise<Merchant | null> {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  const key = match?.[1];
  if (!key?.startsWith(KEY_PREFIX)) return null;
  const [row] = await db
    .select({ merchant: merchants })
    .from(apiKeys)
    .innerJoin(merchants, eq(apiKeys.merchantId, merchants.id))
    .where(and(eq(apiKeys.keyHash, sha256(key)), isNull(apiKeys.revokedAt)));
  return row?.merchant ?? null;
}
