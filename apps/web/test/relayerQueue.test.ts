import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import type { Db } from "@/lib/server/db/client";
import { RelayerBusyError, sendAsRelayer, withRelayerLock, type RelayerChain } from "@/lib/server/relayerQueue";
import { testDb } from "./db";

/** One-at-a-time, like the advisory lock across instances. */
function mutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => {});
    return run;
  };
}

/** A node that only counts a sent transaction as pending a few polls later, as a real RPC node can. */
function laggingChain(lagPolls = 2) {
  let mined = 0;
  const pending: { nonce: number; visibleIn: number }[] = [];
  const chain: RelayerChain = {
    pendingNonce: async () => {
      for (const p of pending) p.visibleIn--;
      const seen = pending.filter((p) => p.visibleIn <= 0).length;
      return mined + seen;
    },
    sleep: async () => {},
  };
  const used: number[] = [];
  const send = async (nonce: number): Promise<Hex> => {
    used.push(nonce);
    pending.push({ nonce, visibleIn: lagPolls });
    return `0x${nonce.toString(16).padStart(64, "0")}`;
  };
  return { chain, send, used, mine: () => (mined += pending.splice(0).length) };
}

describe("relayer queue", () => {
  it("gives concurrent sends consecutive nonces", async () => {
    const { chain, send, used } = laggingChain();
    const lock = mutex();
    const hashes = await Promise.all(Array.from({ length: 5 }, () => sendAsRelayer(send, { lock, chain })));
    expect(used).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(hashes).size).toBe(5);
  });

  it("without the lock, the same race reuses a nonce", async () => {
    const { chain, send, used } = laggingChain();
    const noLock = <T>(fn: () => Promise<T>) => fn();
    await Promise.all([sendAsRelayer(send, { lock: noLock, chain }), sendAsRelayer(send, { lock: noLock, chain })]);
    expect(used[0]).toBe(used[1]);
  });

  it("gives up waiting for a slow node instead of stalling every payment", async () => {
    let polls = 0;
    const chain: RelayerChain = { pendingNonce: async () => (polls++, 7), sleep: async () => {} };
    const hash = await sendAsRelayer(async () => "0x01", { lock: mutex(), chain });
    expect(hash).toBe("0x01");
    expect(polls).toBeGreaterThan(1);
    expect(polls).toBeLessThan(50);
  });

  it("releases the turn when a send fails", async () => {
    const { chain, send, used } = laggingChain();
    const lock = mutex();
    await expect(sendAsRelayer(async () => Promise.reject(new Error("rejected by node")), { lock, chain })).rejects.toThrow("rejected by node");
    await sendAsRelayer(send, { lock, chain });
    expect(used).toEqual([0]);
  });

  it("runs inside a Postgres advisory lock and returns the result", async () => {
    const db = await testDb();
    expect(await withRelayerLock(async () => 42, db)).toBe(42);
    // The lock is transaction-scoped, so it is free again afterwards.
    expect(await withRelayerLock(async () => "again", db)).toBe("again");
  });

  it("turns a lock timeout into a busy error", async () => {
    const timeout = Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
    const db = { transaction: async () => Promise.reject(timeout) } as unknown as Db;
    await expect(withRelayerLock(async () => 1, db)).rejects.toBeInstanceOf(RelayerBusyError);
  });
});
