import { beforeEach, describe, expect, it } from "vitest";
import { getAddress, hashMessage, keccak256, stringToBytes, type Address, type Hex } from "viem";
import { decodeMusdWithdrawal, keyRequestMessage, mezoTestnetAddresses } from "@mezout/sdk";
import type { Db } from "@/lib/server/db/client";
import { authenticate, issueApiKey } from "@/lib/server/apiKeys";
import {
  PasskeyError,
  passkeyByAddress,
  passkeysByCredential,
  registerPasskey,
  verifyPasskeyAssertion,
} from "@/lib/server/passkeys";
import { buildWithdrawalOp } from "@/lib/server/withdrawals";
import { testDb } from "./db";
import { softPasskey } from "./passkey";

const rp = { rpId: "mezout.test", origin: "https://mezout.test" };
// Stand-in for simulating MezoutAccountFactory.createAccount: deterministic per key, rejects the zero key.
const predict = async (qx: Hex, qy: Hex): Promise<Address> => {
  if (BigInt(qx) === 0n) throw new Error("SignerP256InvalidPublicKey");
  return getAddress(`0x${keccak256(`${qx}${qy.slice(2)}`).slice(26)}`);
};

describe("passkey registration", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("creates a merchant whose payout address is the passkey account", async () => {
    const pk = softPasskey();
    const row = await registerPasskey(db, { credentialId: pk.credentialId, publicKey: pk.publicKey }, predict);
    expect(row.publicKey).toBe(pk.publicKey);
    expect((await passkeyByAddress(db, row.accountAddress as Address))?.id).toBe(row.id);
    const merchant = await db.query.merchants.findFirst();
    expect(merchant?.payoutAddress).toBe(row.accountAddress);
  });

  it("is idempotent per public key, including the 0x04-prefixed form", async () => {
    const pk = softPasskey();
    const a = await registerPasskey(db, { credentialId: pk.credentialId, publicKey: pk.publicKey }, predict);
    const b = await registerPasskey(db, { credentialId: "other", publicKey: `0x04${pk.publicKey.slice(2)}` }, predict);
    expect(b.id).toBe(a.id);
  });

  it("keeps every key registered under one credential id, so a squatter cannot hide the real one", async () => {
    const real = softPasskey();
    const squatter = softPasskey();
    await registerPasskey(db, { credentialId: real.credentialId, publicKey: squatter.publicKey }, predict);
    await registerPasskey(db, { credentialId: real.credentialId, publicKey: real.publicKey }, predict);
    const keys = (await passkeysByCredential(db, real.credentialId)).map((r) => r.publicKey);
    expect(keys).toContain(real.publicKey);
    expect(keys).toHaveLength(2);
  });

  it("rejects malformed and invalid public keys", async () => {
    await expect(registerPasskey(db, { credentialId: "x", publicKey: "0x1234" }, predict)).rejects.toThrow(PasskeyError);
    await expect(
      registerPasskey(db, { credentialId: "x", publicKey: `0x${"00".repeat(64)}` }, predict),
    ).rejects.toThrow(/not a valid P-256 key/);
  });
});

describe("passkey assertions", () => {
  const pk = softPasskey();
  const challenge = keccak256(stringToBytes("challenge"));
  const check = (signature: Hex, overrides: Partial<typeof rp & { challenge: Hex; publicKey: Hex }> = {}) =>
    verifyPasskeyAssertion({ publicKey: pk.publicKey, challenge, signature, ...rp, ...overrides });

  it("accepts a valid assertion", () => {
    expect(check(pk.sign(challenge))).toBe(true);
  });

  it("rejects the wrong challenge, key, origin or relying party", () => {
    expect(check(pk.sign(keccak256(stringToBytes("other"))))).toBe(false);
    expect(check(softPasskey().sign(challenge))).toBe(false);
    expect(check(pk.sign(challenge, { origin: "https://evil.test" }))).toBe(false);
    expect(check(pk.sign(challenge, { rpId: "evil.test" }))).toBe(false);
  });

  it("rejects missing user verification, a registration ceremony, high-s and garbage", () => {
    expect(check(pk.sign(challenge, { flags: 0x01 }))).toBe(false);
    expect(check(pk.sign(challenge, { type: "webauthn.create" }))).toBe(false);
    expect(check(pk.sign(challenge, { highS: true }))).toBe(false);
    expect(check("0x1234")).toBe(false);
  });
});

describe("API keys for passkey accounts", () => {
  it("issues a key when the passkey signs the key request", async () => {
    const db = await testDb();
    const pk = softPasskey();
    const row = await registerPasskey(db, { credentialId: pk.credentialId, publicKey: pk.publicKey }, predict);
    const address = row.accountAddress as Address;
    const issuedAt = new Date().toISOString();
    const signature = pk.sign(hashMessage(keyRequestMessage(address, issuedAt)));
    const verify = async ({ message, signature }: { message: string; signature: Hex }) =>
      verifyPasskeyAssertion({ publicKey: pk.publicKey, challenge: hashMessage(message), signature, ...rp });

    const { key } = await issueApiKey(db, { address, issuedAt, signature }, verify);
    expect((await authenticate(db, `Bearer ${key}`))?.payoutAddress).toBe(address);

    const stranger = softPasskey().sign(hashMessage(keyRequestMessage(address, new Date().toISOString())));
    await expect(
      issueApiKey(db, { address, issuedAt: new Date().toISOString(), signature: stranger }, verify),
    ).rejects.toThrow(/does not match/);
  });
});

describe("withdrawal operations", () => {
  it("deploys through initCode only when the account is not deployed, and moves exactly the quoted MUSD", async () => {
    const db = await testDb();
    const pk = softPasskey();
    const row = await registerPasskey(db, { credentialId: pk.credentialId, publicKey: pk.publicKey }, predict);
    const quote = {
      to: getAddress("0x36A95C939Fa70F29421261C770160645Efa9F9E4"),
      amount: 5n * 10n ** 18n,
      nonce: 0n,
      maxFeePerGas: 1_000n,
      deployed: false,
    };

    const fresh = buildWithdrawalOp(row, quote);
    const deployed = buildWithdrawalOp(row, { ...quote, deployed: true });
    expect(fresh.userOperation.factory).toBe(mezoTestnetAddresses.mezoutAccountFactory);
    expect(deployed.userOperation.factory).toBeUndefined();
    expect(fresh.userOpHash).not.toBe(deployed.userOpHash);
    expect(decodeMusdWithdrawal(fresh.userOperation.callData)).toEqual({ to: quote.to, amount: quote.amount });
    expect(buildWithdrawalOp(row, { ...quote, deployed: true, amount: 1n }).userOpHash).not.toBe(deployed.userOpHash);
    // The same quote always rebuilds the same operation, whatever the chain looks like at submit time.
    expect(buildWithdrawalOp(row, { ...quote }).userOpHash).toBe(fresh.userOpHash);
    expect(fresh.maxCost).toBe((2_500_000n + 200_000n + 100_000n) * 1_000n);
  });
});
