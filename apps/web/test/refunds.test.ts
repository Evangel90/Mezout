import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, getAddress, keccak256, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mezoTestnetAddresses } from "@mezout/sdk";
import type { Merchant } from "@/lib/server/apiKeys";
import type { Db } from "@/lib/server/db/client";
import { refunds, webhookEvents } from "@/lib/server/db/schema";
import { INDEXER_START_BLOCK, syncPayments } from "@/lib/server/indexer";
import { findInvoiceView, invoiceStatus } from "@/lib/server/invoices";
import { cancelRefund, completeRefund, refundJson, requestRefund, type ReceiptReader } from "@/lib/server/refunds";
import { FakeChain, ROUTER_V1, ROUTER_V2 } from "./chain";
import { testDb } from "./db";
import { makeInvoice, makeMerchant, ORIGIN } from "./fixtures";

const payer = privateKeyToAccount(generatePrivateKey()).address;
const PAID_BLOCK = INDEXER_START_BLOCK + 10n;

type Transfer = { from: Address; to: Address; value: bigint; token?: Address };
const transferLog = (t: Transfer) => ({
  address: t.token ?? mezoTestnetAddresses.musd,
  topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: t.from, to: t.to } }),
  data: encodeAbiParameters([{ type: "uint256" }], [t.value]),
  blockNumber: PAID_BLOCK + 5n,
  logIndex: 0,
  transactionHash: "0x" as Hex,
  transactionIndex: 0,
  blockHash: "0x" as Hex,
  removed: false,
});

class FakeReceipts implements ReceiptReader {
  receipts = new Map<Hex, { status: "success" | "reverted"; blockNumber: bigint; logs: ReturnType<typeof transferLog>[] }>();
  add(transfers: Transfer[], opts: { status?: "success" | "reverted"; blockNumber?: bigint } = {}): Hex {
    const hash = keccak256(toHex(`refund-${this.receipts.size}`));
    this.receipts.set(hash, {
      status: opts.status ?? "success",
      blockNumber: opts.blockNumber ?? PAID_BLOCK + 5n,
      logs: transfers.map(transferLog),
    });
    return hash;
  }
  getTransactionReceipt = (async ({ hash }: { hash: Hex }) => {
    const r = this.receipts.get(hash);
    if (!r) throw new Error("not found");
    return r;
  }) as unknown as ReceiptReader["getTransactionReceipt"];
}

describe("refunds", () => {
  let db: Db;
  let merchant: Merchant;
  let receipts: FakeReceipts;
  let invoiceId: string;
  let paymentId: string;
  const musd = (v: string) => parseUnits(v, 18);

  beforeEach(async () => {
    db = await testDb();
    merchant = await makeMerchant(db);
    receipts = new FakeReceipts();
    const invoice = await makeInvoice(db, merchant, { amount: "10" });
    invoiceId = invoice.id;
    const chain = new FakeChain(PAID_BLOCK + 2n);
    chain.pay(ROUTER_V2, PAID_BLOCK, { orderId: invoice.orderId as Hex, merchant: getAddress(merchant.payoutAddress), payer, amount: musd("10") });
    await syncPayments(db, chain, { routers: [ROUTER_V1, ROUTER_V2], origin: ORIGIN });
    paymentId = (await findInvoiceView(db, merchant, invoiceId))!.payment!.id;
  });

  const merchantAddr = () => getAddress(merchant.payoutAddress);
  const complete = (txHash: Hex, refundId?: string) =>
    completeRefund(db, merchant, receipts, { paymentId, txHash, refundId }, ORIGIN);

  it("requests the full remaining amount by default, and never more than was paid", async () => {
    const { refund } = await requestRefund(db, merchant, { invoiceId, amount: musd("4"), reason: "damaged" });
    expect(refund).toMatchObject({ status: "pending", amount: musd("4").toString(), reason: "damaged" });
    await expect(requestRefund(db, merchant, { invoiceId, amount: musd("6.01") })).rejects.toThrow(/at most 6 MUSD/);
    const rest = await requestRefund(db, merchant, { invoiceId });
    expect(rest.refund.amount).toBe(musd("6").toString());
    await expect(requestRefund(db, merchant, { invoiceId })).rejects.toThrow(/fully refunded/);
  });

  it("refuses refunds for unpaid or unknown invoices", async () => {
    const unpaid = await makeInvoice(db, merchant);
    await expect(requestRefund(db, merchant, { invoiceId: unpaid.id })).rejects.toThrow(/not been paid/);
    const other = await makeMerchant(db);
    await expect(requestRefund(db, other, { invoiceId })).rejects.toThrow(/No such invoice/);
  });

  it("completes a pending refund from a matching MUSD transfer and emits refund.completed", async () => {
    const { refund } = await requestRefund(db, merchant, { invoiceId });
    const tx = receipts.add([{ from: merchantAddr(), to: payer, value: musd("10") }]);
    const done = await complete(tx, refund.id);
    expect(done).toMatchObject({ id: refund.id, status: "completed", txHash: tx });

    const view = await findInvoiceView(db, merchant, invoiceId);
    expect(view!.refunded).toBe(musd("10"));
    expect(invoiceStatus(view!)).toBe("refunded");
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.type, "refund.completed"));
    const object = (event.data as { object: Record<string, unknown> }).object;
    expect(object).toMatchObject({ id: refund.id, status: "completed", amount: "10", tx_hash: tx });
    expect(object.invoice).toMatchObject({ id: invoiceId, status: "refunded", amount_refunded: "10" });
  });

  it("cancels a pending request, which frees its amount, but never a sent refund", async () => {
    const { refund } = await requestRefund(db, merchant, { invoiceId });
    const canceled = await cancelRefund(db, merchant, refund.id);
    expect(refundJson(canceled, invoiceId)).toMatchObject({ status: "canceled", completed_at: null });
    expect(canceled.canceledAt).toBeInstanceOf(Date);
    await expect(cancelRefund(db, merchant, refund.id)).rejects.toThrow(/is canceled/);
    // The whole amount can be requested again.
    const again = await requestRefund(db, merchant, { invoiceId });
    expect(again.refund.amount).toBe(musd("10").toString());

    await complete(receipts.add([{ from: merchantAddr(), to: payer, value: musd("10") }]), again.refund.id);
    await expect(cancelRefund(db, merchant, again.refund.id)).rejects.toThrow(/is completed/);
    await expect(cancelRefund(db, await makeMerchant(db), again.refund.id)).rejects.toThrow(/No such refund/);
  });

  it("records a refund sent without a request, for the amount transferred", async () => {
    const tx = receipts.add([{ from: merchantAddr(), to: payer, value: musd("2.5") }]);
    const done = await complete(tx);
    expect(done).toMatchObject({ status: "completed", amount: musd("2.5").toString() });
    expect(invoiceStatus((await findInvoiceView(db, merchant, invoiceId))!)).toBe("paid");
  });

  it("rejects transactions that are not a refund of this payment", async () => {
    const other = privateKeyToAccount(generatePrivateKey()).address;
    const cases: Array<[Hex, RegExp]> = [
      [receipts.add([{ from: merchantAddr(), to: other, value: musd("1") }]), /does not send MUSD/],
      [receipts.add([{ from: other, to: payer, value: musd("1") }]), /does not send MUSD/],
      [receipts.add([{ from: merchantAddr(), to: payer, value: musd("1"), token: "0x7b7C000000000000000000000000000000000000" }]), /does not send MUSD/],
      [receipts.add([{ from: merchantAddr(), to: payer, value: musd("1") }], { status: "reverted" }), /failed on-chain/],
      [receipts.add([{ from: merchantAddr(), to: payer, value: musd("1") }], { blockNumber: PAID_BLOCK - 1n }), /before the payment/],
      [receipts.add([{ from: merchantAddr(), to: payer, value: musd("10.000001") }]), /exceed/],
      [keccak256(toHex("unknown")), /not confirmed yet/],
    ];
    for (const [tx, error] of cases) await expect(complete(tx), error.source).rejects.toThrow(error);
    expect(await db.select().from(refunds)).toHaveLength(0);
  });

  it("counts each transaction once", async () => {
    const tx = receipts.add([{ from: merchantAddr(), to: payer, value: musd("1") }]);
    await complete(tx);
    await expect(complete(tx)).rejects.toThrow(/already recorded/);
  });

  it("requires the transfer to match the pending request's amount", async () => {
    const { refund } = await requestRefund(db, merchant, { invoiceId, amount: musd("3") });
    const tx = receipts.add([{ from: merchantAddr(), to: payer, value: musd("2") }]);
    await expect(complete(tx, refund.id)).rejects.toThrow(/does not match the pending refund/);
  });

  it("hides another merchant's payment", async () => {
    const other = await makeMerchant(db);
    const tx = receipts.add([{ from: merchantAddr(), to: payer, value: musd("1") }]);
    await expect(completeRefund(db, other, receipts, { paymentId, txHash: tx }, ORIGIN)).rejects.toThrow(/No such payment/);
  });
});
