import { beforeEach, describe, expect, it } from "vitest";
import { getAddress, parseUnits, verifyMessage, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { signInMessage } from "@mezout/sdk";
import type { Db } from "@/lib/server/db/client";
import { INDEXER_START_BLOCK, syncPayments } from "@/lib/server/indexer";
import { listOrders, ordersCsv, type Order } from "@/lib/server/orders";
import { createSession, endSession, readCookie, sameOrigin, SESSION_TTL_MS, sessionMerchant } from "@/lib/server/sessions";
import { FakeChain, ROUTER_V1, ROUTER_V2 } from "./chain";
import { testDb } from "./db";
import { makeInvoice, makeMerchant, ORIGIN } from "./fixtures";

const verify = (args: { address: Hex; message: string; signature: Hex }) => verifyMessage(args);
const account = privateKeyToAccount(generatePrivateKey());
const now = Date.parse("2026-10-26T12:00:00.000Z");
const issuedAt = new Date(now).toISOString();
const signIn = async (at = issuedAt) => ({
  address: account.address,
  issuedAt: at,
  signature: await account.signMessage({ message: signInMessage(account.address, at) }),
});

describe("dashboard sessions", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("opens a session for a signed sign-in and resolves its cookie", async () => {
    const { token, merchant, expiresAt } = await createSession(db, await signIn(), verify, now);
    expect(merchant.payoutAddress).toBe(account.address);
    expect(expiresAt.getTime()).toBe(now + SESSION_TTL_MS);
    expect((await sessionMerchant(db, token, now))?.id).toBe(merchant.id);
    expect(await sessionMerchant(db, token, now + SESSION_TTL_MS + 1)).toBeNull();
    expect(await sessionMerchant(db, "nope", now)).toBeNull();
    expect(JSON.stringify(await db.query.sessions.findMany())).not.toContain(token);
    await endSession(db, token);
    expect(await sessionMerchant(db, token, now)).toBeNull();
  });

  it("rejects a replayed sign-in, an API-key signature and stale requests", async () => {
    const req = await signIn();
    await createSession(db, req, verify, now);
    await expect(createSession(db, req, verify, now)).rejects.toThrow(/already used/);
    // A signature over the API-key message cannot open a session.
    const { keyRequestMessage } = await import("@mezout/sdk");
    const keySig = await account.signMessage({ message: keyRequestMessage(account.address, issuedAt) });
    await expect(createSession(db, { ...req, signature: keySig }, verify, now)).rejects.toThrow(/does not match/);
    await expect(createSession(db, await signIn(new Date(now - 6 * 60_000).toISOString()), verify, now)).rejects.toThrow(/expired/);
  });

  it("only accepts state changes from the same origin", () => {
    const req = (method: string, origin?: string) =>
      new Request("https://usemezout.vercel.app/v1/invoices", { method, headers: origin ? { origin } : {} });
    expect(sameOrigin(req("GET"))).toBe(true);
    expect(sameOrigin(req("POST", "https://usemezout.vercel.app"))).toBe(true);
    expect(sameOrigin(req("POST", "https://evil.example"))).toBe(false);
    expect(sameOrigin(req("POST"))).toBe(false);
  });

  it("reads one cookie", () => {
    const req = new Request("https://x.test", { headers: { cookie: "a=1; mezout_session=abc%3D; b=2" } });
    expect(readCookie(req, "mezout_session")).toBe("abc=");
    expect(readCookie(req, "missing")).toBeUndefined();
  });
});

describe("order list", () => {
  it("merges stored invoices with payments to older links, newest first", async () => {
    const db = await testDb();
    const merchant = await makeMerchant(db);
    const payer = privateKeyToAccount(generatePrivateKey()).address;
    const pending = await makeInvoice(db, merchant, { amount: "1", reference: "A-1" });
    const paid = await makeInvoice(db, merchant, { amount: "2", reference: "A-2" });
    const chain = new FakeChain(INDEXER_START_BLOCK + 50n);
    const m = getAddress(merchant.payoutAddress);
    chain.pay(ROUTER_V2, INDEXER_START_BLOCK + 10n, { orderId: paid.orderId as Hex, merchant: m, payer, amount: parseUnits("2", 18) });
    chain.pay(ROUTER_V1, INDEXER_START_BLOCK + 20n, { orderId: `0x${"cd".repeat(32)}`, merchant: m, payer, amount: parseUnits("3", 18), method: 1 });
    await syncPayments(db, chain, { routers: [ROUTER_V1, ROUTER_V2], origin: ORIGIN });

    const orders = await listOrders(db, merchant);
    expect(orders.map((o) => [o.reference, o.status, o.amount, o.method])).toEqual(
      expect.arrayContaining([
        ["A-1", "pending", "1", null],
        ["A-2", "paid", "2", "MUSD"],
        [null, "paid", "3", "BORROW"],
      ]),
    );
    expect(orders).toHaveLength(3);
    expect(orders.find((o) => o.invoiceId === pending.id)?.paymentId).toBeNull();
    expect(await listOrders(db, await makeMerchant(db))).toEqual([]);
  });

  it("escapes CSV cells and defuses spreadsheet formulas", () => {
    const order: Order = {
      invoiceId: "inv_1",
      orderId: "0x01",
      reference: '=HYPERLINK("x"), "quoted"',
      amount: "1.5",
      status: "paid",
      refunded: "0",
      method: "MUSD",
      payer: "0xabc",
      paymentId: "pay_1",
      txHash: "0xdef",
      paidAt: "2026-10-26T00:00:00.000Z",
      createdAt: "2026-10-25T00:00:00.000Z",
      pendingRefund: null,
    };
    const [header, line] = ordersCsv([order]).trim().split("\r\n");
    expect(header).toBe("created_at,invoice_id,reference,order_id,status,amount_musd,refunded_musd,method,payer,paid_at,tx_hash");
    expect(line).toBe(`2026-10-25T00:00:00.000Z,inv_1,"'=HYPERLINK(""x""), ""quoted""",0x01,paid,1.5,0,MUSD,0xabc,2026-10-26T00:00:00.000Z,0xdef`);
  });
});
