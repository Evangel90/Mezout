import "server-only";
import { eq } from "drizzle-orm";
import { PublicKey, WebAuthnP256 } from "ox";
import { getAddress, type Address, type Hex } from "viem";
import { decodeWebAuthnSignature, normalizePublicKey, splitPublicKey } from "@mezout/sdk";
import type { Db } from "./db/client";
import { merchants, passkeys } from "./db/schema";

const HALF_N = 0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8n;

export type Passkey = typeof passkeys.$inferSelect;
/** Returns the MezoutAccount address for a key, reverting (throwing) if the factory would reject the key. */
export type PredictAccount = (qx: Hex, qy: Hex) => Promise<Address>;

export class PasskeyError extends Error {}

export async function registerPasskey(
  db: Db,
  input: { credentialId: string; publicKey: Hex },
  predict: PredictAccount,
): Promise<Passkey> {
  let publicKey: Hex;
  try {
    publicKey = normalizePublicKey(input.publicKey);
  } catch {
    throw new PasskeyError("Invalid passkey public key");
  }
  const [existing] = await db.select().from(passkeys).where(eq(passkeys.publicKey, publicKey));
  if (existing) return existing;

  const { qx, qy } = splitPublicKey(publicKey);
  let address: Address;
  try {
    address = getAddress(await predict(qx, qy));
  } catch {
    throw new PasskeyError("This passkey's public key is not a valid P-256 key");
  }

  await db.insert(merchants).values({ payoutAddress: address }).onConflictDoNothing();
  const [merchant] = await db.select().from(merchants).where(eq(merchants.payoutAddress, address));
  const [row] = await db
    .insert(passkeys)
    .values({ merchantId: merchant.id, credentialId: input.credentialId, publicKey, accountAddress: address })
    .onConflictDoNothing({ target: passkeys.publicKey })
    .returning();
  return row ?? (await db.select().from(passkeys).where(eq(passkeys.publicKey, publicKey)))[0];
}

export const passkeysByCredential = (db: Db, credentialId: string) =>
  db.select().from(passkeys).where(eq(passkeys.credentialId, credentialId));

export async function passkeyByAddress(db: Db, address: Address): Promise<Passkey | null> {
  const [row] = await db.select().from(passkeys).where(eq(passkeys.accountAddress, getAddress(address)));
  return row ?? null;
}

/**
 * Checks a WebAuthn assertion (in MezoutAccount's encoding) over `challenge` for `publicKey`, including the relying
 * party and origin, user verification, and the low-s form the contract requires.
 */
export function verifyPasskeyAssertion(args: {
  publicKey: Hex;
  challenge: Hex;
  signature: Hex;
  rpId: string;
  origin: string;
}): boolean {
  try {
    const a = decodeWebAuthnSignature(args.signature);
    if (a.s > HALF_N) return false;
    const { qx, qy } = splitPublicKey(args.publicKey);
    return WebAuthnP256.verify({
      challenge: args.challenge,
      publicKey: PublicKey.from({ prefix: 4, x: BigInt(qx), y: BigInt(qy) }),
      signature: { r: a.r, s: a.s },
      metadata: {
        authenticatorData: a.authenticatorData,
        clientDataJSON: a.clientDataJSON,
        challengeIndex: a.challengeIndex,
        typeIndex: a.typeIndex,
        userVerificationRequired: true,
      },
      rpId: args.rpId,
      origin: args.origin,
    });
  } catch {
    return false;
  }
}

/** The relying party a browser used for this request: the app's own host. */
export function relyingParty(req: Request): { rpId: string; origin: string } {
  const url = new URL(req.url);
  return { rpId: url.hostname, origin: url.origin };
}
