import "server-only";
import { sql } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { publicClient, relayerClient } from "./clients";
import { getDb, type Db } from "./db/client";

/**
 * Every transaction the relayer sends needs the next nonce, and two Vercel instances sending at once would both read
 * the same one and one payment would fail. So relayer sends take turns: each holds a Postgres advisory lock while it
 * reads the nonce, sends, and waits until the RPC node counts the transaction as pending, so the next sender sees the
 * higher nonce. The lock is transaction-scoped: Postgres releases it on commit, on rollback, and if the function dies
 * mid-send, so it can never be left held.
 */

// Any fixed 64-bit number works; it only has to be the same for every sender.
const LOCK_KEY = 0x6d657a6f7574; // "mezout"
const WAIT_FOR_TURN = "15s";
const SEEN_TIMEOUT_MS = 8_000;
const SEEN_POLL_MS = 250;

/** Another relay held the lock for too long. Nothing was sent; the caller can safely try again. */
export class RelayerBusyError extends Error {
  constructor() {
    super("The relayer is busy. Nothing was charged; please try again in a moment.");
  }
}

/** Runs `fn` while holding the relayer lock. Throws RelayerBusyError if the turn doesn't come within 15 seconds. */
export async function withRelayerLock<T>(fn: () => Promise<T>, db: Db = getDb()): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local lock_timeout = '${WAIT_FOR_TURN}'`));
      await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);
      return fn();
    });
  } catch (err) {
    // 55P03: lock_not_available, raised when lock_timeout runs out.
    if ((err as { code?: string })?.code === "55P03") throw new RelayerBusyError();
    throw err;
  }
}

export type RelayerChain = {
  /** The relayer's next nonce, counting transactions the node has accepted but not yet mined. */
  pendingNonce: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
};

const liveChain = (address: Address): RelayerChain => ({
  pendingNonce: () => publicClient().getTransactionCount({ address, blockTag: "pending" }),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});

/**
 * Sends one relayer transaction in turn. `send` receives the nonce to use and returns the transaction hash. The turn
 * ends once the node reports a pending nonce past it (or after 8 seconds, so a slow node can't stall every payment).
 */
export async function sendAsRelayer(
  send: (nonce: number) => Promise<Hex>,
  deps: { lock?: <T>(fn: () => Promise<T>) => Promise<T>; chain?: RelayerChain } = {},
): Promise<Hex> {
  const lock = deps.lock ?? ((fn) => withRelayerLock(fn));
  const chain = deps.chain ?? liveChain(relayerClient().account.address);
  return lock(async () => {
    const nonce = await chain.pendingNonce();
    const hash = await send(nonce);
    for (let waited = 0; waited < SEEN_TIMEOUT_MS; waited += SEEN_POLL_MS) {
      if ((await chain.pendingNonce().catch(() => nonce)) > nonce) break;
      await chain.sleep(SEEN_POLL_MS);
    }
    return hash;
  });
}
