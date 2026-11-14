import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  loanAlertsSubscribeMessage,
  loanAlertsUnsubscribeMessage,
  nominalRatio,
  type LoanAlertSettings,
  type QueuedTrove,
  type RedemptionQueue,
} from "@mezout/sdk";
import type { Db } from "@/lib/server/db/client";
import { loanAlerts } from "@/lib/server/db/schema";
import {
  alertPayload,
  alertStatus,
  breachedThreshold,
  checkSettings,
  evaluateLoanAlerts,
  MAX_FAILURES,
  subscribe,
  unsubscribe,
  type SubscribeDeps,
} from "@/lib/server/loanAlerts";
import type { Sender } from "@/lib/server/webhooks";
import { testDb } from "./db";

const E18 = 10n ** 18n;
const now = Date.parse("2026-11-14T12:00:00.000Z");
const iso = (t: number) => new Date(t).toISOString();
const verify = (args: { address: Address; message: string; signature: Hex }) => verifyMessage(args);
const borrower = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const URL_ = "https://hooks.slack.com/services/T0/B0/xyz";
const settings: LoanAlertSettings = { url: URL_, thresholds: [165, 180], redemption: true };

const okSender = () => vi.fn<Sender>(async () => ({ statusCode: 200, body: "" }));
const deps = (over: Partial<SubscribeDeps> = {}): SubscribeDeps => ({
  verify,
  hasLoan: async () => true,
  send: okSender(),
  allowPrivate: false,
  resolve: async () => ["203.0.113.10"],
  ...over,
});
async function signedSubscribe(at = now, s: LoanAlertSettings = settings, signer = borrower, address: Address = borrower.address) {
  const issuedAt = iso(at);
  const signature = await signer.signMessage({ message: loanAlertsSubscribeMessage(address, s, issuedAt) });
  return { address, issuedAt, signature, ...s };
}
async function signedUnsubscribe(at = now, signer = borrower) {
  const issuedAt = iso(at);
  return { address: borrower.address, issuedAt, signature: await signer.signMessage({ message: loanAlertsUnsubscribeMessage(borrower.address, issuedAt) }) };
}

describe("loan alert settings", () => {
  it("accepts up to three whole thresholds above 110% and normalizes them", () => {
    expect(checkSettings({ url: URL_, thresholds: [165, 180, 165], redemption: false }, false).thresholds).toEqual([180, 165]);
    expect(() => checkSettings({ url: URL_, thresholds: [110], redemption: false }, false)).toThrow(/111%/);
    expect(() => checkSettings({ url: URL_, thresholds: [150.5], redemption: false }, false)).toThrow(/whole/);
    expect(() => checkSettings({ url: URL_, thresholds: [150, 160, 170, 180], redemption: false }, false)).toThrow(/at most 3/);
    expect(() => checkSettings({ url: URL_, thresholds: [], redemption: false }, false)).toThrow(/at least one/);
  });

  it("refuses URLs Mezout must not call", () => {
    for (const url of ["http://hooks.example/x", "https://127.0.0.1/x", "https://localhost/x", "https://user:pw@hooks.example/x", "nope"]) {
      expect(() => checkSettings({ url, thresholds: [180], redemption: false }, false)).toThrow();
    }
  });
});

describe("subscribing", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("stores a signed subscription after a test alert reaches the URL", async () => {
    const send = okSender();
    const row = await subscribe(db, await signedSubscribe(), deps({ send }), now);
    expect(row).toMatchObject({ borrower: borrower.address, url: URL_, thresholds: [180, 165], redemption: true, disabledAt: null });
    expect(send).toHaveBeenCalledOnce();
    expect(String(send.mock.calls[0][1])).toContain("Loan alerts are on");
    // The public status never includes the URL.
    const status = await alertStatus(db, borrower.address);
    expect(status).toMatchObject({ active: true, thresholds: [180, 165], redemption: true, delivery_failed: false });
    expect(JSON.stringify(status)).not.toContain("hooks.slack.com");
  });

  it("rejects a signature from another wallet, over other settings, or out of date", async () => {
    await expect(subscribe(db, await signedSubscribe(now, settings, stranger), deps(), now)).rejects.toThrow(/does not match/);
    // Signed for one URL, submitted with another: the rebuilt message differs.
    const req = await signedSubscribe();
    await expect(subscribe(db, { ...req, url: "https://evil.example/hook" }, deps(), now)).rejects.toThrow(/does not match/);
    await expect(subscribe(db, { ...req, thresholds: [120] }, deps(), now)).rejects.toThrow(/does not match/);
    await expect(subscribe(db, await signedSubscribe(now - 6 * 60_000), deps(), now)).rejects.toThrow(/expired/);
    await expect(subscribe(db, await signedSubscribe(now + 5 * 60_000), deps(), now)).rejects.toThrow(/expired/);
    await expect(subscribe(db, { ...req, issuedAt: "2026-11-14 12:00" }, deps(), now)).rejects.toThrow(/ISO/);
    // An unsubscribe signature cannot subscribe.
    const off = await signedUnsubscribe();
    await expect(subscribe(db, { ...req, signature: off.signature }, deps(), now)).rejects.toThrow(/does not match/);
    expect(await db.select().from(loanAlerts)).toEqual([]);
  });

  it("refuses replays, including after unsubscribing", async () => {
    const first = await signedSubscribe();
    await subscribe(db, first, deps(), now);
    await expect(subscribe(db, first, deps(), now + 1000)).rejects.toThrow(/already used/);
    expect(await unsubscribe(db, await signedUnsubscribe(now + 1000), verify, now + 1000)).toBe(true);
    // The old subscribe signature is still inside its 5 minutes but older than the unsubscribe.
    await expect(subscribe(db, first, deps(), now + 2000)).rejects.toThrow(/already used/);
    const [row] = await db.select().from(loanAlerts);
    expect(row.url).toBeNull();
    expect(row.disabledAt).not.toBeNull();
    // A fresh signature turns them back on.
    await subscribe(db, await signedSubscribe(now + 3000), deps(), now + 3000);
    expect((await alertStatus(db, borrower.address)).active).toBe(true);
  });

  it("needs an open loan and a URL that answers", async () => {
    await expect(subscribe(db, await signedSubscribe(), deps({ hasLoan: async () => false }), now)).rejects.toThrow(/no open Mezo loan/);
    const failing = vi.fn<Sender>(async () => ({ statusCode: 404, body: "" }));
    await expect(subscribe(db, await signedSubscribe(), deps({ send: failing }), now)).rejects.toThrow(/test alert/);
    await expect(subscribe(db, await signedSubscribe(), deps({ resolve: async () => ["10.0.0.5"] }), now)).rejects.toThrow(/public internet/);
    expect(await db.select().from(loanAlerts)).toEqual([]);
  });

  it("only lets the wallet itself unsubscribe", async () => {
    await subscribe(db, await signedSubscribe(), deps(), now);
    await expect(unsubscribe(db, await signedUnsubscribe(now + 1000, stranger), verify, now + 1000)).rejects.toThrow(/does not match/);
    expect((await alertStatus(db, borrower.address)).active).toBe(true);
  });
});

describe("alert payloads", () => {
  const event = { type: "loan.ratio_below", borrower: borrower.address, text: "hi" };
  it("speaks Discord, ntfy and plain JSON", () => {
    expect(JSON.parse(alertPayload("https://discord.com/api/webhooks/1/x", event).body)).toEqual({ content: "Mezout loan alert: hi" });
    const ntfy = alertPayload("https://ntfy.sh/my-loan-topic", event);
    expect(ntfy.body).toBe("Mezout loan alert: hi");
    expect(ntfy.headers["content-type"]).toContain("text/plain");
    expect(JSON.parse(alertPayload(URL_, event).body)).toMatchObject({ type: "loan.ratio_below", text: "Mezout loan alert: hi" });
  });
});

describe("threshold crossing", () => {
  it("reports the lowest threshold crossed and clears it only with a margin", () => {
    const t = [180, 165];
    expect(breachedThreshold(190, t, null)).toBeNull();
    expect(breachedThreshold(179, t, null)).toBe(180);
    expect(breachedThreshold(160, t, 180)).toBe(165);
    expect(breachedThreshold(168, t, 165)).toBe(165); // still within 5 points of 165
    expect(breachedThreshold(171, t, 165)).toBe(180);
    expect(breachedThreshold(184, t, 180)).toBe(180);
    expect(breachedThreshold(186, t, 180)).toBeNull();
    // A threshold the borrower has since removed is not kept.
    expect(breachedThreshold(168, [180], 165)).toBe(180);
  });
});

describe("scheduled evaluation", () => {
  let db: Db;
  const PRICE = 100_000n * E18;
  const APP = "https://mezout.test";
  const own = getAddress(borrower.address);
  const other = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
  /** A loan of `debt` MUSD at `ratio`% collateral, at $100,000 per BTC. */
  const loan = (owner: Address, ratio: number, debt: bigint): QueuedTrove => {
    const d = debt * E18;
    const coll = (d * BigInt(Math.round(ratio * 100))) / 10_000n / 100_000n;
    return { owner, coll, principal: d, interest: 0n, debt: d, nicr: nominalRatio(coll, d) };
  };
  const queue = (troves: QueuedTrove[]): RedemptionQueue => ({ price: PRICE, gasCompensation: 200n * E18, mcr: 11n * 10n ** 17n, troves, readAt: now });
  /** 20 loans of 100,000 MUSD at 150%, which put 1,996,000 MUSD in front of anything above 150%. */
  const crowd = Array.from({ length: 20 }, (_, i) => loan(other(i + 1), 150, 100_000n));

  beforeEach(async () => {
    db = await testDb();
    await subscribe(db, await signedSubscribe(), deps(), now);
  });
  const run = (troves: QueuedTrove[], send: Sender, at = now) => evaluateLoanAlerts(db, async () => queue(troves), send, { appUrl: APP, now: at });
  const row = async () => (await db.select().from(loanAlerts))[0];

  it("does not read Mezo when nobody is subscribed", async () => {
    const empty = await testDb();
    const read = vi.fn(async () => queue([]));
    expect(await evaluateLoanAlerts(empty, read, okSender(), { appUrl: APP })).toEqual({ checked: 0, sent: 0, failed: 0 });
    expect(read).not.toHaveBeenCalled();
  });

  it("alerts once per threshold crossed as the ratio falls", async () => {
    const send = okSender();
    expect(await run([...crowd, loan(own, 200, 2_000n)], send)).toEqual({ checked: 1, sent: 0, failed: 0 });
    expect(await run([...crowd, loan(own, 175, 2_000n)], send)).toMatchObject({ sent: 1 });
    expect(String(send.mock.calls[0][1])).toContain("below your 180% alert");
    expect(String(send.mock.calls[0][1])).toContain(`${APP}/loan?address=${own}`);
    // Same level again: quiet.
    expect(await run([...crowd, loan(own, 172, 2_000n)], send)).toMatchObject({ sent: 0 });
    expect(await run([...crowd, loan(own, 160, 2_000n)], send)).toMatchObject({ sent: 1 });
    expect(String(send.mock.calls[1][1])).toContain("below your 165% alert");
    expect((await row()).breachedThreshold).toBe(165);
    // Recovering past 185% resets, and a new fall alerts again.
    expect(await run([...crowd, loan(own, 190, 2_000n)], send)).toMatchObject({ sent: 0 });
    expect((await row()).breachedThreshold).toBeNull();
    expect(await run([...crowd, loan(own, 179, 2_000n)], send)).toMatchObject({ sent: 1 });
    expect((await row()).lastAlertAt?.getTime()).toBe(now);
  });

  it("alerts when the loan reaches the front of the redemption line, once", async () => {
    const send = okSender();
    // At 200% behind the crowd: nearly 2M MUSD in front, low exposure.
    await run([...crowd, loan(own, 200, 2_000n)], send);
    expect(send).not.toHaveBeenCalled();
    // At 140% it is first in line.
    // At 140% it is first in line. 140% is below 165% too, so the ratio alert goes out with it.
    expect(await run([...crowd, loan(own, 140, 2_000n)], send)).toMatchObject({ sent: 2 });
    const bodies = send.mock.calls.map((c) => JSON.parse(String(c[1])));
    expect(bodies.map((b) => b.type)).toEqual(["loan.ratio_below", "loan.redemption_risk"]);
    expect(bodies[1]).toMatchObject({ position: 1, musd_ahead: "0" });
    expect(bodies[1].text).toContain("number 1 in Mezo's redemption line");
    expect(await row()).toMatchObject({ breachedThreshold: 165, redemptionHigh: true });
    // Still first in line: nothing new.
    expect(await run([...crowd, loan(own, 139, 2_000n)], send)).toMatchObject({ sent: 0 });
    // Back behind the crowd resets, so a later return to the front alerts again.
    await run([...crowd, loan(own, 200, 2_000n)], send);
    expect((await row()).redemptionHigh).toBe(false);
  });

  it("says when the loan is gone and stops", async () => {
    const send = okSender();
    expect(await run(crowd, send)).toMatchObject({ sent: 1 });
    expect(String(send.mock.calls[0][1])).toContain("no longer has an open Mezo loan");
    const r = await row();
    expect(r.disabledAt).not.toBeNull();
    expect(r.url).toBeNull();
    expect(await run(crowd, send)).toEqual({ checked: 0, sent: 0, failed: 0 });
  });

  it("retries a failed alert next run and gives up after repeated failures", async () => {
    const down = vi.fn<Sender>(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const troves = [...crowd, loan(own, 175, 2_000n)];
    expect(await run(troves, down)).toMatchObject({ sent: 0, failed: 1 });
    // State is unchanged, so the same alert is tried again.
    expect((await row()).breachedThreshold).toBeNull();
    const up = okSender();
    expect(await run(troves, up)).toMatchObject({ sent: 1 });
    expect((await row()).failures).toBe(0);

    const worse = [...crowd, loan(own, 160, 2_000n)];
    for (let i = 0; i < MAX_FAILURES; i++) await run(worse, down);
    const r = await row();
    expect(r.failures).toBe(MAX_FAILURES);
    expect(r.disabledAt).not.toBeNull();
    expect((await alertStatus(db, own)).delivery_failed).toBe(true);
  });
});
