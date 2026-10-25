import "server-only";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { getAbiItem, getAddress, type Address, type PublicClient } from "viem";
import { mezoutRouterAbi } from "@mezout/sdk";
import type { Db } from "./db/client";
import { chainCursors, invoices, merchants, payments } from "./db/schema";
import { invoiceJson, METHODS, viewInvoices } from "./invoices";
import { newId, recordEvent } from "./webhooks";

/** MezoutRouter v1's deploy block: nothing Mezout recorded happened before it. */
export const INDEXER_START_BLOCK = 16_341_328n;
// Mezo's RPC caps eth_getLogs at a distance of 10,000 blocks between fromBlock and toBlock.
export const MAX_BLOCK_RANGE = 10_000n;
const CURSOR = "payments";
const paidEvent = getAbiItem({ abi: mezoutRouterAbi, name: "Paid" });

export type ChainReader = Pick<PublicClient, "getBlockNumber" | "getLogs" | "getBlock">;

type Cursor = typeof chainCursors.$inferSelect;

export async function readCursor(db: Db): Promise<Cursor | null> {
  const [row] = await db.select().from(chainCursors).where(eq(chainCursors.name, CURSOR));
  return row ?? null;
}

/**
 * Reads Paid events from the routers up to one block behind the head, records each payment once, emits
 * invoice.paid for stored invoices, and advances the cursor. Each chunk commits on its own, so a timeout loses no
 * work, and running two syncs at once is safe: inserts are idempotent and the cursor only moves forward.
 */
export async function syncPayments(
  db: Db,
  client: ChainReader,
  opts: { routers: Address[]; origin: string; maxChunks?: number },
): Promise<{ fromBlock: bigint; toBlock: bigint; recorded: number } | null> {
  const cursor = await readCursor(db);
  const start = cursor ? BigInt(cursor.block) + 1n : INDEXER_START_BLOCK;
  // Wait one block before treating a payment as final.
  const safe = (await client.getBlockNumber()) - 1n;
  if (start > safe) return null;

  let from = start;
  let recorded = 0;
  for (let chunk = 0; chunk < (opts.maxChunks ?? 4) && from <= safe; chunk++) {
    const to = from + MAX_BLOCK_RANGE - 1n < safe ? from + MAX_BLOCK_RANGE - 1n : safe;
    const logs = await client.getLogs({ address: opts.routers, event: paidEvent, fromBlock: from, toBlock: to, strict: true });
    const blockTimes = new Map<bigint, Date>();
    for (const n of new Set([...logs.map((l) => l.blockNumber), to])) {
      const block = await client.getBlock({ blockNumber: n });
      blockTimes.set(n, new Date(Number(block.timestamp) * 1000));
    }

    await db.transaction(async (tx) => {
      for (const log of logs) {
        const a = log.args;
        const [payment] = await tx
          .insert(payments)
          .values({
            id: newId("pay"),
            router: getAddress(log.address),
            orderId: a.orderId,
            merchant: getAddress(a.merchant),
            payer: getAddress(a.payer),
            amount: a.amount.toString(),
            fee: a.fee.toString(),
            method: METHODS[a.method] ?? String(a.method),
            assetIn: getAddress(a.assetIn),
            amountIn: a.amountIn.toString(),
            borrowed: a.borrowed.toString(),
            txHash: log.transactionHash,
            logIndex: log.logIndex,
            blockNumber: Number(log.blockNumber),
            paidAt: blockTimes.get(log.blockNumber)!,
          })
          .onConflictDoNothing()
          .returning();
        if (!payment) continue;
        recorded++;
        const [row] = await tx
          .select({ invoice: invoices, merchant: merchants })
          .from(invoices)
          .innerJoin(merchants, eq(invoices.merchantId, merchants.id))
          .where(and(eq(invoices.orderId, payment.orderId), sql`lower(${invoices.router}) = lower(${payment.router})`));
        if (row) {
          const [view] = await viewInvoices(tx as unknown as Db, [row.invoice]);
          await recordEvent(tx, row.merchant.id, "invoice.paid", `invoice.paid:${row.invoice.id}`, invoiceJson(view, row.merchant, opts.origin));
        }
      }
      const blockTime = blockTimes.get(to)!;
      await tx
        .insert(chainCursors)
        .values({ name: CURSOR, block: Number(to), blockTime, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: chainCursors.name,
          set: {
            block: sql`greatest(${chainCursors.block}, excluded.block)`,
            blockTime: sql`case when excluded.block > ${chainCursors.block} then excluded.block_time else ${chainCursors.blockTime} end`,
            updatedAt: sql`now()`,
          },
        });
    });
    from = to + 1n;
  }
  return { fromBlock: start, toBlock: from - 1n, recorded };
}

/**
 * Emits invoice.expired for stored invoices whose expiry has passed on-chain without a payment. It only trusts chain
 * time up to the indexed block, so a payment mined just before the expiry is always seen first.
 */
export async function recordExpiries(db: Db, origin: string, limit = 100): Promise<number> {
  const cursor = await readCursor(db);
  if (!cursor) return 0;
  const due = await db
    .select({ invoice: invoices, merchant: merchants })
    .from(invoices)
    .innerJoin(merchants, eq(invoices.merchantId, merchants.id))
    .leftJoin(payments, and(eq(payments.orderId, invoices.orderId), sql`lower(${payments.router}) = lower(${invoices.router})`))
    .where(and(isNull(invoices.expiredEventAt), lte(invoices.expiresAt, cursor.blockTime), isNull(payments.id)))
    .limit(limit);
  let count = 0;
  for (const { invoice, merchant } of due) {
    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(invoices)
        .set({ expiredEventAt: new Date() })
        .where(and(eq(invoices.id, invoice.id), isNull(invoices.expiredEventAt)))
        .returning({ id: invoices.id });
      if (!claimed) return;
      const view = { row: invoice, payment: null, refunded: 0n };
      await recordEvent(tx, merchant.id, "invoice.expired", `invoice.expired:${invoice.id}`, invoiceJson(view, merchant, origin));
      count++;
    });
  }
  return count;
}
