import { PublicKey, WebAuthnP256 } from "ox";
import { bytesToHex, getAddress, parseEventLogs, type Address, type Hex, type Log } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { txUrl } from "./config";
import { encodeWebAuthnSignature } from "@mezout/sdk";

/** A merchant signed in with a passkey. All three values are public; the private key never leaves the device. */
export type PasskeySession = { credentialId: string; publicKey: Hex; address: Address };

const STORAGE_KEY = "mezout.passkey";

export function loadSession(): PasskeySession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PasskeySession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: PasskeySession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the session lasts for this page only; "Sign in with passkey" restores it.
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as T;
}

const randomHex = (n: number) => bytesToHex(crypto.getRandomValues(new Uint8Array(n)));

/** Creates a passkey on this device and registers its MezoutAccount. */
export async function createPasskeyAccount(name: string): Promise<PasskeySession> {
  const credential = await WebAuthnP256.createCredential({
    name,
    // A random user id per account: the same id on one device would replace an earlier passkey.
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name, displayName: name },
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
  });
  const publicKey = PublicKey.toHex(credential.publicKey, { includePrefix: false });
  const { address } = await post<{ address: Address }>("/api/passkeys", { credentialId: credential.id, publicKey });
  return { credentialId: credential.id, publicKey, address: getAddress(address) };
}

/** Lets the user pick one of their Mezout passkeys, then finds its account. */
export async function signInWithPasskey(): Promise<PasskeySession> {
  const challenge = randomHex(32);
  const { id, metadata, signature } = await WebAuthnP256.sign({ challenge });
  const { accounts } = await post<{ accounts: { address: Address; publicKey: Hex }[] }>("/api/passkeys/lookup", {
    credentialId: id,
  });
  // Keep the account whose stored key actually produced this signature.
  const match = accounts.find((a) =>
    WebAuthnP256.verify({
      challenge,
      metadata,
      signature,
      publicKey: PublicKey.from({ prefix: 4, x: BigInt(`0x${a.publicKey.slice(2, 66)}`), y: BigInt(`0x${a.publicKey.slice(66)}`) }),
    }),
  );
  if (!match) throw new Error("This passkey is not registered with Mezout on this site.");
  return { credentialId: id, publicKey: match.publicKey, address: getAddress(match.address) };
}

/** Signs a 32-byte hash with the session's passkey, encoded for MezoutAccount and the server. */
export async function passkeySign(session: PasskeySession, hash: Hex): Promise<Hex> {
  const { metadata, signature } = await WebAuthnP256.sign({ credentialId: session.credentialId, challenge: hash });
  const { authenticatorData, clientDataJSON } = metadata;
  return encodeWebAuthnSignature({
    r: signature.r,
    s: signature.s,
    authenticatorData,
    clientDataJSON,
    challengeIndex: metadata.challengeIndex ?? clientDataJSON.indexOf('"challenge"'),
    typeIndex: metadata.typeIndex ?? clientDataJSON.indexOf('"type"'),
  });
}

/**
 * Sends MUSD out of a passkey MezoutAccount (a withdrawal or a refund): the server builds the operation, the passkey
 * signs its hash, and Mezout sponsors the gas. Resolves once it succeeded on-chain.
 */
export async function passkeySendMusd(
  session: PasskeySession,
  to: Address,
  amount: string,
  waitForReceipt: (hash: Hex) => Promise<{ logs: Log[] }>,
): Promise<Hex> {
  const { quote, userOpHash } = await post<{ quote: Record<string, unknown>; userOpHash: Hex }>("/api/account/withdraw", {
    step: "quote",
    account: session.address,
    to,
    amount,
  });
  const signature = await passkeySign(session, userOpHash);
  const { hash } = await post<{ hash: Hex }>("/api/account/withdraw", {
    step: "submit",
    account: session.address,
    ...quote,
    signature,
  });
  const receipt = await waitForReceipt(hash).catch(() => {
    throw new Error(`Submitted, but confirmation is taking a while. Check ${txUrl(hash)}`);
  });
  const [event] = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs });
  if (!event?.args.success) throw new Error("The transfer was rejected on-chain. Nothing was sent.");
  return hash;
}
