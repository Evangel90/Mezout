import { beforeEach, describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, getAddress, keccak256, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mezoTestnetAddresses, mezoutRouterAbi } from "@mezout/sdk";
import type { Merchant } from "@/lib/server/apiKeys";
import type { Db } from "@/lib/server/db/client";
import { refunds } from "@/lib/server/db/schema";
import { syncPayments } from "@/lib/server/indexer";
import { verifyInvoicePayment, type ReceiptReader } from "@/lib/server/verify";
import { FakeChain, ROUTER_V1, ROUTER_V2 } from "./chain";
import { testDb } from "./db";
import { makeInvoice, makeMerchant, ORIGIN } from "./fixtures";

const payer = privateKeyToAccount(generatePrivateKey()).address;

type PaidLog = { router: Address; orderId: Hex; merchant: Address; amount: bigint };

/** A receipt reader with one transaction per hash, each carrying raw Paid logs as an RPC would return them. */
function fakeReceipts(txs: Record<Hex, { status: "success" | "reverted"; logs: PaidLog[] }>): ReceiptReader {
  return {
    getTransactionReceipt: (async ({ hash }: { hash: Hex }) => {
      const tx = txs[hash];
      if (!tx) throw new Error("TransactionReceiptNotFoundError");
      return {
        status: tx.status,
        logs: tx.logs.map((l, i) => ({
          address: l.router,
          topics: encodeEventTopics({ abi: mezoutRouterAbi, eventName: "Paid", args: { orderId: l.orderId, merchant: l.merchant, payer } }),
          data: encodeAbiParameters(
            [{ type: "uint256" }, { type: "uint256" }, { type: "uint8" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
            [l.amount, 0n, 0, mezoTestnetAddresses.musd, l.amount, 0n],
          ),
          blockNumber: 100n,
          transactionHash: hash,
          logIndex: i,
          blockHash: keccak256(toHex("b")),
          transactionIndex: 0,
          removed: false,
        })),
      };
    }) as unknown as ReceiptReader["getTransactionReceipt"],
  };
}

const hash = (s: string) => keccak256(toHex(s));

describe("verifyInvoicePayment", () => {
  let db: Db;
  let merchant: Merchant;
  beforeEach(async () => {
    db = await testDb();
    merchant = await makeMerchant(db);
  });

  it("reports an unpaid invoice as not paid, and an expired one as expired", async () => {
    const pending = await makeInvoice(db, merchant, { amount: "0.05" });
    const r = await verifyInvoicePayment(db, merchant, { invoice: pending.id }, fakeReceipts({}));
    expect(r).toMatchObject({ found: true, isValid: false, invalidReason: "invoice_not_paid" });

    const old = await makeInvoice(db, merchant, { now: Date.now() - 3_600_000, expiresIn: 300 });
    const e = await verifyInvoicePayment(db, merchant, { invoice: old.id }, fakeReceipts({}));
    expect(e).toMatchObject({ isValid: false, invalidReason: "invoice_expired" });
  });

  it("does not find another merchant's invoice", async () => {
    const other = await makeMerchant(db);
    const inv = await makeInvoice(db, other);
    expect(await verifyInvoicePayment(db, merchant, { invoice: inv.id }, fakeReceipts({}))).toEqual({ found: false });
  });

  it("accepts a payment straight from the receipt before the indexer sees it", async () => {
    const inv = await makeInvoice(db, merchant, { amount: "0.05" });
    const tx = hash("tx1");
    const chain = fakeReceipts({
      [tx]: {
        status: "success",
        logs: [{ router: ROUTER_V2, orderId: inv.orderId as Hex, merchant: getAddress(merchant.payoutAddress), amount: parseUnits("0.05", 18) }],
      },
    });
    const r = await verifyInvoicePayment(db, merchant, { invoice: inv.id, transaction: tx }, chain);
    expect(r).toMatchObject({ isValid: true, payment: { payer, amount: "0.05", method: "MUSD", tx_hash: tx, source: "receipt" } });
  });

  it("rejects receipts that do not pay this invoice", async () => {
    const inv = await makeInvoice(db, merchant, { amount: "0.05" });
    const merchantAddr = getAddress(merchant.payoutAddress);
    const base = { orderId: inv.orderId as Hex, merchant: merchantAddr, amount: parseUnits("0.05", 18) };
    const chain = fakeReceipts({
      [hash("reverted")]: { status: "reverted", logs: [{ router: ROUTER_V2, ...base }] },
      [hash("wrong-router")]: { status: "success", logs: [{ ...base, router: ROUTER_V1 }] },
      [hash("wrong-amount")]: { status: "success", logs: [{ ...base, router: ROUTER_V2, amount: 1n }] },
      [hash("wrong-order")]: { status: "success", logs: [{ ...base, router: ROUTER_V2, orderId: hash("other") }] },
    });
    const check = (tx: Hex) => verifyInvoicePayment(db, merchant, { invoice: inv.id, transaction: tx }, chain);
    expect(await check(hash("missing"))).toMatchObject({ invalidReason: "transaction_not_found" });
    expect(await check(hash("reverted"))).toMatchObject({ invalidReason: "transaction_failed" });
    expect(await check(hash("wrong-router"))).toMatchObject({ invalidReason: "transaction_mismatch" });
    expect(await check(hash("wrong-amount"))).toMatchObject({ invalidReason: "transaction_mismatch" });
    expect(await check(hash("wrong-order"))).toMatchObject({ invalidReason: "transaction_mismatch" });
  });

  it("uses the index, after syncing, and checks the named transaction against it", async () => {
    const inv = await makeInvoice(db, merchant, { amount: "1" });
    const chain = new FakeChain(16_400_000n);
    const tx = chain.pay(ROUTER_V2, chain.head - 5n, {
      orderId: inv.orderId as Hex,
      merchant: getAddress(merchant.payoutAddress),
      payer,
      amount: parseUnits("1", 18),
    });
    const sync = () => syncPayments(db, chain, { routers: [ROUTER_V1, ROUTER_V2], origin: ORIGIN, maxChunks: 10 });
    const r = await verifyInvoicePayment(db, merchant, { invoice: inv.id }, fakeReceipts({}), { sync });
    expect(r).toMatchObject({ isValid: true, payment: { tx_hash: tx, source: "index", payer } });
    expect(await verifyInvoicePayment(db, merchant, { invoice: inv.id, transaction: hash("x") }, fakeReceipts({}))).toMatchObject({
      invalidReason: "transaction_mismatch",
    });

    // A fully refunded payment no longer unlocks anything.
    const view = r.found ? r.view : null;
    await db.insert(refunds).values({
      id: "re_test",
      paymentId: view!.payment!.id,
      merchantId: merchant.id,
      amount: parseUnits("1", 18).toString(),
      status: "completed",
    });
    expect(await verifyInvoicePayment(db, merchant, { invoice: inv.id }, fakeReceipts({}))).toMatchObject({
      invalidReason: "invoice_refunded",
    });
  });

  it("checks x402 requirements against the invoice", async () => {
    const inv = await makeInvoice(db, merchant, { amount: "0.05" });
    const good = {
      scheme: "mezout",
      network: "eip155:31611",
      asset: mezoTestnetAddresses.musd,
      amount: parseUnits("0.05", 18).toString(),
      payTo: merchant.payoutAddress,
      extra: { invoice: inv.id },
    };
    const check = (requirements: object) => verifyInvoicePayment(db, merchant, { invoice: inv.id, requirements }, fakeReceipts({}));
    expect(await check(good)).toMatchObject({ invalidReason: "invoice_not_paid" });
    expect(await check({ ...good, amount: "1" })).toMatchObject({ invalidReason: "requirements_mismatch" });
    expect(await check({ ...good, network: "eip155:8453" })).toMatchObject({ invalidReason: "requirements_mismatch" });
    expect(await check({ ...good, scheme: "exact" })).toMatchObject({ invalidReason: "requirements_mismatch" });
    expect(await check({ ...good, payTo: payer })).toMatchObject({ invalidReason: "requirements_mismatch" });
  });
});
