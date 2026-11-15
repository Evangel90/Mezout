import { beforeEach, describe, expect, it } from "vitest";
import { getAddress, keccak256, type Address, type Hex, type PublicClient } from "viem";
import { encodeRecoveryAction, mezoTestnetAddresses, mezoutAccountFactoryV2, type RecoveryAction } from "@mezout/sdk";
import type { Db } from "@/lib/server/db/client";
import { passkeyByAddress, passkeysByCredential, registerPasskey, type Passkey } from "@/lib/server/passkeys";
import {
  buildRecoveryOp,
  checkRecoveryAction,
  linkChallenge,
  linkRecoveredPasskey,
  readRecoveryStatus,
  RecoveryError,
  type RecoveryStatus,
} from "@/lib/server/recovery";
import { testDb } from "./db";
import { softPasskey } from "./passkey";

const predict = async (qx: Hex, qy: Hex): Promise<Address> => getAddress(`0x${keccak256(`${qx}${qy.slice(2)}`).slice(26)}`);
const DAY = 86_400;
const wallet = getAddress("0x36A95C939Fa70F29421261C770160645Efa9F9E4");

/** A stand-in chain: just the reads the recovery code makes. */
function fakeClient(opts: { deployed?: boolean; v1?: boolean; reverts?: boolean; v2Predicts?: Address; state?: Record<string, unknown> } = {}) {
  const state: Record<string, unknown> = {
    recoverySigner: [0, "0x0000000000000000000000000000000000000000", `0x${"00".repeat(32)}`, `0x${"00".repeat(32)}`, 0n],
    pendingRecovery: [`0x${"00".repeat(32)}`, `0x${"00".repeat(32)}`, 0n],
    recoveryNonce: 0n,
    signer: [`0x${"aa".repeat(32)}`, `0x${"bb".repeat(32)}`],
    ...opts.state,
  };
  const calls: unknown[] = [];
  const client = {
    getCode: async () => (opts.deployed === false ? undefined : "0x6080"),
    readContract: async ({ functionName }: { functionName: string }) => {
      // The v2 factory's prediction: by default a different address, so the account is a v1 one.
      if (functionName === "getAddress") return opts.v2Predicts ?? wallet;
      if (opts.v1) throw new Error("execution reverted");
      return state[functionName];
    },
    call: async (args: unknown) => {
      calls.push(args);
      if (opts.reverts) throw new Error("execution reverted");
      return { data: "0x" };
    },
  } as unknown as PublicClient;
  return { client, calls };
}

const status = (over: Partial<RecoveryStatus> = {}): RecoveryStatus => ({
  supported: true,
  deployed: true,
  signer: null,
  delay: 0,
  pending: null,
  nonce: "0",
  owner: `0x${"aa".repeat(32)}${"bb".repeat(32)}`,
  ...over,
});

describe("recovery status", () => {
  let row: Passkey;
  beforeEach(async () => {
    const pk = softPasskey();
    row = await registerPasskey(await testDb(), { credentialId: pk.credentialId, publicKey: pk.publicKey }, predict);
  });

  it("reads a v2 account's backup passkey and pending recovery", async () => {
    const x = `0x${"11".repeat(32)}`;
    const y = `0x${"22".repeat(32)}`;
    const { client } = fakeClient({
      state: { recoverySigner: [2, "0x0000000000000000000000000000000000000000", x, y, 172_800n], pendingRecovery: [y, x, 1_800_000_000n], recoveryNonce: 3n },
    });
    expect(await readRecoveryStatus(client, row)).toEqual({
      supported: true,
      deployed: true,
      signer: { kind: "passkey", publicKey: `0x${"11".repeat(32)}${"22".repeat(32)}` },
      delay: 172_800,
      pending: { publicKey: `0x${"22".repeat(32)}${"11".repeat(32)}`, readyAt: 1_800_000_000 },
      nonce: "3",
      owner: `0x${"aa".repeat(32)}${"bb".repeat(32)}`,
    });
  });

  it("reads a recovery wallet", async () => {
    const { client } = fakeClient({ state: { recoverySigner: [1, wallet.toLowerCase(), `0x${"00".repeat(32)}`, `0x${"00".repeat(32)}`, 604_800n] } });
    const s = await readRecoveryStatus(client, row);
    expect(s.signer).toEqual({ kind: "address", address: wallet });
    expect(s.pending).toBeNull();
  });

  it("reports v1 accounts, deployed or not, as unsupported", async () => {
    expect((await readRecoveryStatus(fakeClient({ v1: true }).client, row)).supported).toBe(false);
    expect((await readRecoveryStatus(fakeClient({ deployed: false }).client, row)).supported).toBe(false);
  });

  it("reports an undeployed account the v2 factory would deploy as supported", async () => {
    const s = await readRecoveryStatus(fakeClient({ deployed: false, v2Predicts: row.accountAddress as Address }).client, row);
    expect(s).toMatchObject({ supported: true, deployed: false, signer: null });
  });
});

describe("owner actions", () => {
  let row: Passkey;
  const backup = softPasskey();
  beforeEach(async () => {
    const pk = softPasskey();
    row = await registerPasskey(await testDb(), { credentialId: pk.credentialId, publicKey: pk.publicKey }, predict);
  });
  const check = (action: RecoveryAction, s = status(), opts = {}) => {
    const { client, calls } = fakeClient(opts);
    return { result: checkRecoveryAction(client, row, s, action), calls };
  };

  it("checks a deployed account's change by calling the account from itself", async () => {
    const { result, calls } = check({ type: "setPasskey", publicKey: backup.publicKey, delay: 2 * DAY });
    await expect(result).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ account: row.accountAddress, to: row.accountAddress });
  });

  it("refuses what the contract would refuse, before the relayer pays for it", async () => {
    await expect(check({ type: "setPasskey", publicKey: backup.publicKey, delay: 2 * DAY }, status({ supported: false })).result).rejects.toThrow(/before recovery/);
    await expect(check({ type: "setPasskey", publicKey: backup.publicKey, delay: 2 * DAY - 1 }).result).rejects.toThrow(/between 2 and 30 days/);
    await expect(check({ type: "setAddress", address: wallet, delay: 31 * DAY }).result).rejects.toThrow(/between 2 and 30 days/);
    await expect(check({ type: "setPasskey", publicKey: row.publicKey as Hex, delay: 2 * DAY }).result).rejects.toThrow(/different passkey/);
    await expect(check({ type: "setAddress", address: row.accountAddress as Address, delay: 2 * DAY }).result).rejects.toThrow(/can't be this account/);
    await expect(check({ type: "remove" }).result).rejects.toThrow(/No recovery method/);
    await expect(check({ type: "cancel" }).result).rejects.toThrow(/No recovery is in progress/);
    await expect(check({ type: "setAddress", address: wallet, delay: 2 * DAY }, status(), { reverts: true }).result).rejects.toThrow(RecoveryError);
  });

  it("allows cancel and remove when there is something to cancel or remove", async () => {
    const s = status({ signer: { kind: "address", address: wallet }, delay: 2 * DAY, pending: { publicKey: backup.publicKey, readyAt: 1 } });
    await expect(check({ type: "cancel" }, s).result).resolves.toBeUndefined();
    await expect(check({ type: "remove" }, s).result).resolves.toBeUndefined();
  });

  it("builds the user operation around the encoded self-call", async () => {
    const { client } = fakeClient();
    const quote = { nonce: 4n, maxFeePerGas: 1_000n, deployed: true };
    const action: RecoveryAction = { type: "setAddress", address: wallet, delay: 7 * DAY };
    const op = await buildRecoveryOp(client, row, quote, action);
    expect(op.userOperation.callData).toBe(encodeRecoveryAction(row.accountAddress as Address, action));
    expect(op.userOperation.factory).toBeUndefined();
    expect((await buildRecoveryOp(client, row, quote, { type: "remove" })).userOpHash).not.toBe(op.userOpHash);
    // Undeployed: deploys through whichever factory predicts the account's address.
    const fresh = await buildRecoveryOp(client, row, { ...quote, deployed: false }, action);
    expect(fresh.userOperation.factory).toBe(mezoTestnetAddresses.mezoutAccountFactory);
    const v2 = fakeClient({ v2Predicts: row.accountAddress as Address }).client;
    const freshV2 = await buildRecoveryOp(v2, row, { ...quote, deployed: false }, action);
    expect(freshV2.userOperation.factory).toBe(mezoutAccountFactoryV2);
  });
});

describe("linking a recovered passkey", () => {
  let db: Db;
  let row: Passkey;
  const lost = softPasskey();
  const fresh = softPasskey();
  beforeEach(async () => {
    db = await testDb();
    row = await registerPasskey(db, { credentialId: lost.credentialId, publicKey: lost.publicKey }, predict);
  });

  it("points the account at the new passkey once it owns the account on-chain", async () => {
    await linkRecoveredPasskey(db, row, { credentialId: fresh.credentialId, publicKey: fresh.publicKey }, fresh.publicKey);
    const updated = await passkeyByAddress(db, row.accountAddress as Address);
    expect(updated?.publicKey).toBe(fresh.publicKey);
    expect(updated?.merchantId).toBe(row.merchantId);
    expect((await passkeysByCredential(db, fresh.credentialId)).map((r) => r.accountAddress)).toEqual([row.accountAddress]);
    expect(await passkeysByCredential(db, lost.credentialId)).toHaveLength(0);
  });

  it("refuses a passkey that does not own the account yet", async () => {
    await expect(
      linkRecoveredPasskey(db, row, { credentialId: fresh.credentialId, publicKey: fresh.publicKey }, lost.publicKey),
    ).rejects.toThrow(/doesn't own the account/);
    expect((await passkeyByAddress(db, row.accountAddress as Address))?.publicKey).toBe(lost.publicKey);
  });

  it("refuses a passkey that already has its own account", async () => {
    await registerPasskey(db, { credentialId: fresh.credentialId, publicKey: fresh.publicKey }, predict);
    await expect(
      linkRecoveredPasskey(db, row, { credentialId: fresh.credentialId, publicKey: fresh.publicKey }, fresh.publicKey),
    ).rejects.toThrow(/its own Mezout account/);
  });

  it("binds the proof of possession to the account and the key", () => {
    const a = row.accountAddress as Address;
    expect(linkChallenge(a, fresh.publicKey)).not.toBe(linkChallenge(a, lost.publicKey));
    expect(linkChallenge(a, fresh.publicKey)).not.toBe(linkChallenge(wallet, fresh.publicKey));
  });
});
