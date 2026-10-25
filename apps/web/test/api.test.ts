import { beforeEach, describe, expect, it } from "vitest";
import { verifyMessage, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { decodeSignedInvoice, encodeSignedInvoice, keyRequestMessage } from "@mezout/sdk";
import type { Db } from "@/lib/server/db/client";
import { authenticate, issueApiKey, MAX_ACTIVE_KEYS, REQUEST_TTL_MS } from "@/lib/server/apiKeys";
import { createInvoice, findInvoice, invoiceJson, invoiceStatus } from "@/lib/server/invoices";
import { testDb } from "./db";

const verify = (args: { address: Hex; message: string; signature: Hex }) => verifyMessage(args);
const fakeSign = async (invoice: Parameters<typeof encodeSignedInvoice>[0]["invoice"]) =>
  encodeSignedInvoice({ invoice, signature: "0x01" });

const merchantAccount = privateKeyToAccount(generatePrivateKey());
const now = Date.parse("2026-10-24T12:00:00.000Z");
const issuedAt = new Date(now).toISOString();

async function signedRequest(account = merchantAccount, at = issuedAt) {
  const signature = await account.signMessage({ message: keyRequestMessage(account.address, at) });
  return { address: account.address, issuedAt: at, signature };
}

describe("API keys", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("issues a key for a signed request and authenticates with it", async () => {
    const { key, prefix, merchant } = await issueApiKey(db, await signedRequest(), verify, now);
    expect(key).toMatch(/^mzk_test_[A-Za-z0-9_-]{32}$/);
    expect(key.startsWith(prefix)).toBe(true);
    expect(merchant.payoutAddress).toBe(merchantAccount.address);
    expect((await authenticate(db, `Bearer ${key}`))?.id).toBe(merchant.id);
  });

  it("stores only a hash of the key", async () => {
    const { key } = await issueApiKey(db, await signedRequest(), verify, now);
    const rows = await db.query.apiKeys.findMany();
    expect(JSON.stringify(rows)).not.toContain(key);
  });

  it("rejects a signature from another wallet", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const req = { ...(await signedRequest(other)), address: merchantAccount.address };
    await expect(issueApiKey(db, req, verify, now)).rejects.toThrow(/does not match/);
  });

  it("rejects a replayed signed request", async () => {
    const req = await signedRequest();
    await issueApiKey(db, req, verify, now);
    await expect(issueApiKey(db, req, verify, now)).rejects.toThrow(/already used/);
  });

  it("rejects stale and non-canonical timestamps", async () => {
    await expect(issueApiKey(db, await signedRequest(), verify, now + REQUEST_TTL_MS + 1)).rejects.toThrow(/expired/);
    await expect(issueApiKey(db, await signedRequest(undefined, "2026-10-24T12:00:00Z"), verify, now)).rejects.toThrow(
      /ISO 8601/,
    );
  });

  it("caps active keys per merchant", async () => {
    for (let i = 0; i < MAX_ACTIVE_KEYS; i++) {
      await issueApiKey(db, await signedRequest(undefined, new Date(now - i * 1000).toISOString()), verify, now);
    }
    const extra = await signedRequest(undefined, new Date(now - 10_000).toISOString());
    await expect(issueApiKey(db, extra, verify, now)).rejects.toThrow(/at most/);
  });

  it("rejects missing, malformed and unknown keys", async () => {
    expect(await authenticate(db, null)).toBeNull();
    expect(await authenticate(db, "Basic abc")).toBeNull();
    expect(await authenticate(db, "Bearer mzk_test_unknown")).toBeNull();
  });
});

describe("invoices", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("records the router the invoice was signed for", async () => {
    const { merchant } = await issueApiKey(db, await signedRequest(), verify, now);
    const router = "0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431";
    const sign = async (invoice: Parameters<typeof encodeSignedInvoice>[0]["invoice"]) =>
      encodeSignedInvoice({ invoice, signature: "0x01", router });
    const row = await createInvoice(db, merchant, { amount: "1", expiresIn: 3600 }, sign, now);
    expect(row.router).toBe(router);
    expect(decodeSignedInvoice(row.token).router).toBe(router);
  });

  it("creates a signed invoice that pays the key's merchant", async () => {
    const { merchant } = await issueApiKey(db, await signedRequest(), verify, now);
    const row = await createInvoice(db, merchant, { amount: "25.5", reference: "order-42", expiresIn: 3600 }, fakeSign, now);

    const { invoice } = decodeSignedInvoice(row.token);
    expect(invoice.merchant).toBe(merchantAccount.address);
    expect(invoice.amount).toBe(25_500_000_000_000_000_000n);
    expect(invoice.fee).toBe(0n);
    expect(invoice.orderId).toBe(row.orderId);
    expect(invoice.expiry).toBe(BigInt(now / 1000 + 3600));
    // fakeSign names no router, so the row records the first router, as for links made before routers were tracked.
    expect(row.router).toBe("0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199");

    const json = invoiceJson(row, merchant, "pending", "https://mezout.test/v1/invoices");
    expect(json).toMatchObject({
      object: "invoice",
      amount: "25.5",
      fee: "0",
      currency: "MUSD",
      reference: "order-42",
      status: "pending",
      expires_at: "2026-10-24T13:00:00.000Z",
    });
    expect(json.id).toMatch(/^inv_[0-9a-f]{24}$/);
    expect(json.checkout_url).toBe(`https://mezout.test/pay/${row.token}`);
  });

  it("hides another merchant's invoice", async () => {
    const a = (await issueApiKey(db, await signedRequest(), verify, now)).merchant;
    const b = (await issueApiKey(db, await signedRequest(privateKeyToAccount(generatePrivateKey())), verify, now))
      .merchant;
    const row = await createInvoice(db, a, { amount: "1", expiresIn: 3600 }, fakeSign, now);
    expect((await findInvoice(db, a, row.id))?.id).toBe(row.id);
    expect(await findInvoice(db, b, row.id)).toBeNull();
  });

  it("derives status from the chain and the expiry", async () => {
    const { merchant } = await issueApiKey(db, await signedRequest(), verify, now);
    const row = await createInvoice(db, merchant, { amount: "1", expiresIn: 3600 }, fakeSign, now);
    expect(invoiceStatus(row, false, now)).toBe("pending");
    expect(invoiceStatus(row, false, now + 3600_000)).toBe("expired");
    expect(invoiceStatus(row, true, now + 3600_000)).toBe("paid");
  });
});
