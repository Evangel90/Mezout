import { PublicKey, WebAuthnP256 } from "ox";
import { getAddress, hashTypedData, type Address, type Hex, type Log } from "viem";
import { encodeWebAuthnSignature, recoveredPasskeyChallenge, startRecoveryTypedData, type RecoveryAction } from "@mezout/sdk";
import type { RecoveryStatus } from "./server/recovery";
import { passkeyUserOp, post, saveSession, type PasskeySession } from "./passkey";
import { network } from "./network";

export type { RecoveryStatus };
export type Wait = (hash: Hex) => Promise<{ logs: Log[]; status?: "success" | "reverted" }>;

async function confirmed(wait: Wait, hash: Hex) {
  const receipt = await wait(hash);
  if (receipt.status === "reverted") throw new Error("The transaction was rejected on-chain. Refresh and try again.");
}

export const DAY = 86_400;
/** Waiting periods offered in the dashboard; the contract allows 2 to 30 days. */
export const DELAY_OPTIONS = [2, 7, 14, 30].map((d) => ({ days: d, seconds: d * DAY }));

export async function fetchRecoveryStatus(account: Address): Promise<RecoveryStatus> {
  const res = await fetch(`/api/account/recovery?account=${account}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(res.status === 404 ? "No Mezout passkey account has this address." : (json.error ?? "Request failed"));
  return json as RecoveryStatus;
}

/** Changes the recovery settings with the owner passkey; Mezout pays the network fee. */
export function changeRecovery(session: PasskeySession, action: RecoveryAction, wait: Wait): Promise<Hex> {
  return passkeyUserOp(session, "/api/account/recovery", { action }, wait, "The account rejected this change. Nothing changed.");
}

/** Creates a passkey on this device (or another, through the browser's options) without registering an account. */
export async function createLocalPasskey(name: string): Promise<{ credentialId: string; publicKey: Hex }> {
  const credential = await WebAuthnP256.createCredential({
    name,
    // A random user id, so this passkey never replaces the account's own passkey on the same device.
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name, displayName: name },
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
  });
  return { credentialId: credential.id, publicKey: PublicKey.toHex(credential.publicKey, { includePrefix: false }) };
}

async function signWithPasskey(challenge: Hex, credentialId?: string): Promise<Hex> {
  const { metadata, signature } = await WebAuthnP256.sign({ challenge, ...(credentialId ? { credentialId } : {}) });
  return encodeWebAuthnSignature({
    r: signature.r,
    s: signature.s,
    authenticatorData: metadata.authenticatorData,
    clientDataJSON: metadata.clientDataJSON,
    challengeIndex: metadata.challengeIndex ?? metadata.clientDataJSON.indexOf('"challenge"'),
    typeIndex: metadata.typeIndex ?? metadata.clientDataJSON.indexOf('"type"'),
  });
}

/** The typed data a recovery signer approves to hand `account` to `newPublicKey`. */
export const recoveryRequest = (account: Address, newPublicKey: Hex, status: RecoveryStatus) =>
  startRecoveryTypedData(account, newPublicKey, BigInt(status.nonce), network.chainId);

/** The backup passkey approves the request (the browser lets the user pick it). */
export const signRecoveryWithPasskey = (account: Address, newPublicKey: Hex, status: RecoveryStatus) =>
  signWithPasskey(hashTypedData(recoveryRequest(account, newPublicKey, status)));

export async function startRecovery(account: Address, publicKey: Hex, signature: Hex, wait: Wait): Promise<Hex> {
  const { hash } = await post<{ hash: Hex }>("/api/account/recovery", { step: "start", account, publicKey, signature });
  await confirmed(wait, hash);
  return hash;
}

/** A recovery started on this device: the new passkey lives here, so it is finished here too. */
export type LocalRecovery = { account: Address; credentialId: string; publicKey: Hex };
const STORAGE_KEY = "mezout.recovery";

export function loadLocalRecovery(): LocalRecovery | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalRecovery) : null;
  } catch {
    return null;
  }
}

export function saveLocalRecovery(value: LocalRecovery | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the recovery still finishes on-chain; the new passkey can sign in once linked.
  }
}

/**
 * Finishes a recovery whose delay has passed: completes it on-chain (unless that already happened), then proves this
 * device holds the new passkey so Mezout signs it in to the account. Returns the new session.
 */
export async function finishRecovery(local: LocalRecovery, status: RecoveryStatus, wait: Wait): Promise<PasskeySession> {
  if (status.pending) {
    const { hash } = await post<{ hash: Hex }>("/api/account/recovery", { step: "complete", account: local.account });
    await confirmed(wait, hash);
  }
  const signature = await signWithPasskey(recoveredPasskeyChallenge(local.account, local.publicKey), local.credentialId);
  const row = await post<{ address: Address; publicKey: Hex; credentialId: string }>("/api/account/recovery", {
    step: "link",
    account: local.account,
    credentialId: local.credentialId,
    publicKey: local.publicKey,
    signature,
  });
  const session = { credentialId: row.credentialId, publicKey: row.publicKey, address: getAddress(row.address) };
  saveSession(session);
  saveLocalRecovery(null);
  return session;
}

export const shortKey = (publicKey: Hex) => `${publicKey.slice(0, 8)}…${publicKey.slice(-6)}`;
