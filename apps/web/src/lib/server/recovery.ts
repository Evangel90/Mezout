import "server-only";
import { eq } from "drizzle-orm";
import { getAddress, isAddressEqual, type Address, type Hex, type PublicClient } from "viem";
import {
  encodeRecoveryAction,
  encodeRecoveryCall,
  MAX_RECOVERY_DELAY,
  MIN_RECOVERY_DELAY,
  mezoutAccountV2Abi,
  normalizePublicKey,
  RECOVERY_KIND,
  recoveredPasskeyChallenge,
  type RecoveryAction,
} from "@mezout/sdk";
import type { Db } from "./db/client";
import { passkeys } from "./db/schema";
import type { Passkey } from "./passkeys";
import { accountFactory, accountFactoryV2, buildAccountOp, isDeployed, type OpQuote } from "./withdrawals";

export class RecoveryError extends Error {}

export type RecoverySigner = { kind: "passkey"; publicKey: Hex } | { kind: "address"; address: Address };

export type RecoveryStatus = {
  /** A MezoutAccountV2, which has recovery. v1 accounts do not. */
  supported: boolean;
  deployed: boolean;
  signer: RecoverySigner | null;
  /** Seconds between starting and completing a recovery. 0 when no signer is set. */
  delay: number;
  /** The passkey that takes over, and when (unix seconds). */
  pending: { publicKey: Hex; readyAt: number } | null;
  /** The value a recovery signer's request must carry now. */
  nonce: string;
  /** The passkey that owns the account now (x || y). */
  owner: Hex;
};

const joinKey = (qx: Hex, qy: Hex): Hex => `0x${qx.slice(2)}${qy.slice(2)}`;

/** Reads an account's recovery settings from the chain. */
export async function readRecoveryStatus(client: PublicClient, account: Passkey): Promise<RecoveryStatus> {
  const address = account.accountAddress as Address;
  const deployed = await isDeployed(client, address);
  const empty = { deployed, signer: null, delay: 0, pending: null, nonce: "0", owner: normalizePublicKey(account.publicKey as Hex) };
  if (!deployed) {
    // Not deployed yet: it is a v2 account if the v2 factory would deploy it, and nothing is set.
    const v2 = accountFactoryV2();
    return { ...empty, supported: !!v2 && (await accountFactory(client, account)) === v2 };
  }
  const read = <F extends "recoverySigner" | "pendingRecovery" | "recoveryNonce" | "signer">(functionName: F) =>
    client.readContract({ address, abi: mezoutAccountV2Abi, functionName });
  let signer, pending, nonce, owner;
  try {
    [signer, pending, nonce, owner] = await Promise.all([read("recoverySigner"), read("pendingRecovery"), read("recoveryNonce"), read("signer")]);
  } catch {
    return { ...empty, supported: false }; // a v1 account: these functions don't exist
  }
  const [kind, recoveryAddress, rx, ry, delay] = signer;
  const [px, py, readyAt] = pending;
  return {
    supported: true,
    deployed,
    signer:
      kind === RECOVERY_KIND.passkey
        ? { kind: "passkey", publicKey: joinKey(rx, ry) }
        : kind === RECOVERY_KIND.address
          ? { kind: "address", address: getAddress(recoveryAddress) }
          : null,
    delay: Number(delay),
    pending: readyAt === 0n ? null : { publicKey: joinKey(px, py), readyAt: Number(readyAt) },
    nonce: nonce.toString(),
    owner: joinKey(owner[0], owner[1]),
  };
}

/**
 * Checks an owner action against the account's current state, so the relayer never sponsors an operation whose call
 * would revert. A deployed account is checked by running the call from the account itself (the contract's own rules);
 * an undeployed one can only be setting its first recovery signer.
 */
export async function checkRecoveryAction(client: PublicClient, account: Passkey, status: RecoveryStatus, action: RecoveryAction) {
  if (!status.supported) throw new RecoveryError("This account was created before recovery existed");
  if (action.type === "setPasskey" || action.type === "setAddress") {
    if (!Number.isInteger(action.delay) || action.delay < MIN_RECOVERY_DELAY || action.delay > MAX_RECOVERY_DELAY) {
      throw new RecoveryError("Choose a delay between 2 and 30 days");
    }
  }
  if (action.type === "setPasskey") {
    if (normalizePublicKey(action.publicKey) === normalizePublicKey(account.publicKey as Hex)) {
      throw new RecoveryError("Use a different passkey from the one you sign in with");
    }
  }
  if (action.type === "setAddress" && isAddressEqual(action.address, account.accountAddress as Address)) {
    throw new RecoveryError("The recovery wallet can't be this account");
  }
  if (action.type === "remove" && !status.signer) throw new RecoveryError("No recovery method is set");
  if (action.type === "cancel" && !status.pending) throw new RecoveryError("No recovery is in progress");
  if (!status.deployed) {
    if (action.type !== "setPasskey" && action.type !== "setAddress") throw new RecoveryError("No recovery method is set");
    return;
  }
  const address = account.accountAddress as Address;
  try {
    // From the account to itself, exactly as the execute batch will call it.
    await client.call({ account: address, to: address, data: encodeRecoveryCall(action) });
  } catch {
    throw new RecoveryError("The account rejected this change. Check the passkey or address and try again.");
  }
}

/** Rebuilds the user operation for an owner action on the recovery settings. */
export async function buildRecoveryOp(client: PublicClient, account: Passkey, quote: OpQuote, action: RecoveryAction) {
  const factory = quote.deployed ? undefined : await accountFactory(client, account);
  return buildAccountOp(account, quote, encodeRecoveryAction(account.accountAddress as Address, action), factory);
}

/**
 * What the new passkey signs to prove it is held by whoever links it to the recovered account, so nobody else can
 * attach a credential id of their choosing to it.
 */
export const linkChallenge = recoveredPasskeyChallenge;

/**
 * After a completed recovery, points the account's passkey record at the new passkey so sign-in and withdrawals use it.
 * `onChainKey` is the account's current signer, read from the chain; the new key must match it.
 */
export async function linkRecoveredPasskey(
  db: Db,
  account: Passkey,
  input: { credentialId: string; publicKey: Hex },
  onChainKey: Hex,
): Promise<Passkey> {
  const publicKey = normalizePublicKey(input.publicKey);
  if (publicKey !== normalizePublicKey(onChainKey)) throw new RecoveryError("This passkey doesn't own the account yet");
  const [other] = await db.select().from(passkeys).where(eq(passkeys.publicKey, publicKey));
  if (other && other.id !== account.id) throw new RecoveryError("This passkey already has its own Mezout account");
  const [row] = await db
    .update(passkeys)
    .set({ publicKey, credentialId: input.credentialId })
    .where(eq(passkeys.id, account.id))
    .returning();
  return row;
}
