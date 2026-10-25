import { beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { getAddress, parseUnits } from "viem";
import type { Db } from "@/lib/server/db/client";
import { chainCursors, payments, webhookDeliveries, webhookEvents } from "@/lib/server/db/schema";
import { INDEXER_START_BLOCK, readCursor, recordExpiries, syncPayments } from "@/lib/server/indexer";
import { findInvoiceView, invoiceStatus } from "@/lib/server/invoices";
import { BTC, FakeChain, ROUTER_V1, ROUTER_V2 } from "./chain";
import { testDb } from "./db";
import { makeEndpoint, makeInvoice, makeMerchant, ORIGIN } from "./fixtures";

const payer = privateKeyToAccount(generatePrivateKey()).address;
const routers = [ROUTER_V1, ROUTER_V2];
const start = INDEXER_START_BLOCK;

describe("indexer", () => {
  let db: Db;
  let chain: FakeChain;
  beforeEach(async () => {
    db = await testDb();
    chain = new FakeChain(start + 25_000n);
  });

  const sync = (maxChunks = 10) => syncPayments(db, chain, { routers, origin: ORIGIN, maxChunks });

  it("backfills from the v1 deploy block in ranges the RPC accepts, and marks the invoice paid", async () => {
    const merchant = await makeMerchant(db);
    await makeEndpoint(db, merchant);
    const invoice = await makeInvoice(db, merchant, { amount: "12.5", reference: "order-7" });
    const tx = chain.pay(ROUTER_V2, start + 21_000n, {
      orderId: invoice.orderId as `0x${string}`,
      merchant: getAddress(merchant.payoutAddress),
      payer,
      amount: parseUnits("12.5", 18),
      method: 3,
      assetIn: BTC,
      amountIn: 123n,
    });

    const result = await sync();
    expect(result).toEqual({ fromBlock: start, toBlock: chain.head - 1n, recorded: 1 });
    expect(chain.ranges[0]).toEqual([start, start + 9_999n]);
    for (const [from, to] of chain.ranges) expect(to - from).toBeLessThan(10_000n);

    const view = await findInvoiceView(db, merchant, invoice.id);
    expect(view?.payment).toMatchObject({ txHash: tx, method: "BTC", payer, amountIn: "123", assetIn: BTC });
    expect(invoiceStatus(view!)).toBe("paid");

    const [event] = await db.select().from(webhookEvents);
    expect(event).toMatchObject({ type: "invoice.paid", merchantId: merchant.id, dedupeKey: `invoice.paid:${invoice.id}` });
    const object = (event.data as { object: Record<string, unknown> }).object;
    expect(object).toMatchObject({ id: invoice.id, status: "paid", reference: "order-7", amount: "12.5" });
    expect(object.payment).toMatchObject({ tx_hash: tx, method: "BTC", payer });
    expect(await db.select().from(webhookDeliveries)).toHaveLength(1);
  });

  it("waits one block before recording a payment", async () => {
    const merchant = await makeMerchant(db);
    const invoice = await makeInvoice(db, merchant);
    chain.pay(ROUTER_V2, chain.head, { orderId: invoice.orderId as `0x${string}`, merchant: getAddress(merchant.payoutAddress), payer, amount: 1n });
    expect((await sync())?.recorded).toBe(0);
    expect((await readCursor(db))?.block).toBe(Number(chain.head - 1n));
    chain.head += 1n;
    expect((await sync())?.recorded).toBe(1);
  });

  it("is idempotent when blocks are read twice", async () => {
    const merchant = await makeMerchant(db);
    const invoice = await makeInvoice(db, merchant);
    chain.pay(ROUTER_V2, start + 5n, { orderId: invoice.orderId as `0x${string}`, merchant: getAddress(merchant.payoutAddress), payer, amount: 1n });
    await sync();
    // Rewind the cursor, as if a second sync had raced the first.
    await db.update(chainCursors).set({ block: Number(start - 1n) });
    expect((await sync())?.recorded).toBe(0);
    expect(await db.select().from(payments)).toHaveLength(1);
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
  });

  it("never moves the cursor backwards", async () => {
    await syncPayments(db, new FakeChain(start + 101n), { routers, origin: ORIGIN });
    expect((await readCursor(db))!.block).toBe(Number(start + 100n));
    // While this sync reads blocks up to +200, a faster one commits up to +5000.
    chain.head = start + 201n;
    const getLogs = chain.getLogs;
    chain.getLogs = (async (args: never) => {
      await db.update(chainCursors).set({ block: Number(start + 5_000n) });
      return getLogs(args);
    }) as unknown as typeof chain.getLogs;
    await syncPayments(db, chain, { routers, origin: ORIGIN });
    expect((await readCursor(db))!.block).toBe(Number(start + 5_000n));
  });

  it("stops after maxChunks and resumes where it left off", async () => {
    await sync(1);
    expect((await readCursor(db))?.block).toBe(Number(start + 9_999n));
    await sync(1);
    expect((await readCursor(db))?.block).toBe(Number(start + 19_999n));
  });

  it("only pays an invoice from the router it was signed for", async () => {
    const merchant = await makeMerchant(db);
    const invoice = await makeInvoice(db, merchant, { router: ROUTER_V2 });
    chain.pay(ROUTER_V1, start + 5n, { orderId: invoice.orderId as `0x${string}`, merchant: getAddress(merchant.payoutAddress), payer, amount: 1n });
    await sync();
    expect((await findInvoiceView(db, merchant, invoice.id))?.payment).toBeNull();
    expect(await db.select().from(payments)).toHaveLength(1);
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("records payments to links that were never stored, without an event", async () => {
    const merchant = await makeMerchant(db);
    chain.pay(ROUTER_V1, start + 5n, { orderId: `0x${"ab".repeat(32)}`, merchant: getAddress(merchant.payoutAddress), payer, amount: 1n });
    await sync();
    expect(await db.select().from(payments)).toHaveLength(1);
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("announces an expiry once, and only after chain time has passed it", async () => {
    const merchant = await makeMerchant(db);
    await makeEndpoint(db, merchant);
    const chainNow = chain.blockTime(chain.head - 1n) * 1000;
    // Expires 100 seconds (50 blocks) before the last indexed block; another expires after it.
    const expired = await makeInvoice(db, merchant, { now: chainNow - 400_000, expiresIn: 300 });
    await makeInvoice(db, merchant, { now: chainNow, expiresIn: 300 });
    const paidLate = await makeInvoice(db, merchant, { now: chainNow - 400_000, expiresIn: 300 });
    chain.pay(ROUTER_V2, chain.head - 100n, { orderId: paidLate.orderId as `0x${string}`, merchant: getAddress(merchant.payoutAddress), payer, amount: 1n });

    expect(await recordExpiries(db, ORIGIN)).toBe(0); // nothing indexed yet, so chain time is unknown
    await sync();
    expect(await recordExpiries(db, ORIGIN)).toBe(1);
    expect(await recordExpiries(db, ORIGIN)).toBe(0);
    const events = await db.select().from(webhookEvents);
    expect(events.map((e) => e.dedupeKey).sort()).toEqual([`invoice.expired:${expired.id}`, `invoice.paid:${paidLate.id}`].sort());
  });
});
