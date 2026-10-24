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

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class KeyRequestError extends Error {}

export async function issueApiKey(
  db: Db,
  req: { address: Address; issuedAt: string; signature: Hex },
  verify: VerifySignature,
  now = Date.now(),
): Promise<{ key: string; prefix: string; merchant: Merchant }> {
  const issued = Date.parse(req.issuedAt);
  if (Number.isNaN(issued) || new Date(issued).toISOString() !== req.issuedAt) {
    throw new KeyRequestError("issuedAt must be an ISO 8601 UTC timestamp");
  }
  if (issued > now + 60_000 || now - issued > REQUEST_TTL_MS) {
    throw new KeyRequestError("This request has expired. Sign a new one.");
  }
  const address = getAddress(req.address);
  const message = keyRequestMessage(address, req.issuedAt);
  if (!(await verify({ address, message, signature: req.signature }))) {
    throw new KeyRequestError("The signature does not match the payout address.");
  }

  await db.insert(merchants).values({ payoutAddress: address }).onConflictDoNothing();
  const [merchant] = await db.select().from(merchants).where(eq(merchants.payoutAddress, address));

  const active = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.merchantId, merchant.id), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_ACTIVE_KEYS) {
    throw new KeyRequestError(`A merchant can hold at most ${MAX_ACTIVE_KEYS} active keys.`);
  }

  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  const prefix = key.slice(0, KEY_PREFIX.length + 6);
  // The signed message, not the signature, is the replay key: ECDSA signatures can be re-encoded.
  const inserted = await db
    .insert(apiKeys)
    .values({ merchantId: merchant.id, prefix, keyHash: sha256(key), requestHash: hashMessage(message) })
    .onConflictDoNothing({ target: apiKeys.requestHash })
    .returning({ id: apiKeys.id });
  if (inserted.length === 0) throw new KeyRequestError("This signed request was already used.");
  return { key, prefix, merchant };
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
