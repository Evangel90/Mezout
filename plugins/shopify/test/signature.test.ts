import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signMezoutPayload, verifyMezoutSignature } from "../app/mezout/signature";

const secret = "whsec_test_secret";
const body = '{"id":"evt_1","type":"invoice.paid","data":{"object":{"id":"inv_1","amount":"25"}}}';
const t = 1_800_000_000;
const now = t * 1000;

describe("verifyMezoutSignature", () => {
  it("accepts a signature computed as HMAC-SHA256 of '<t>.<raw body>' (the scheme in docs/API.md)", () => {
    const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(verifyMezoutSignature(body, `t=${t},v1=${v1}`, secret, { now })).toBe(true);
  });

  it("matches the helper used to sign test events", () => {
    expect(verifyMezoutSignature(body, signMezoutPayload(body, secret, t), secret, { now })).toBe(true);
  });

  it("tolerates spaces and an uppercase signature", () => {
    const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex").toUpperCase();
    expect(verifyMezoutSignature(body, ` t=${t} , v1=${v1} `, secret, { now })).toBe(true);
  });

  it("rejects a changed body", () => {
    const header = signMezoutPayload(body, secret, t);
    expect(verifyMezoutSignature(body.replace('"25"', '"2500"'), header, secret, { now })).toBe(false);
  });

  it("rejects a re-serialised body (signatures cover the raw bytes)", () => {
    const header = signMezoutPayload(body, secret, t);
    expect(verifyMezoutSignature(JSON.stringify(JSON.parse(body), null, 2), header, secret, { now })).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifyMezoutSignature(body, signMezoutPayload(body, "whsec_other", t), secret, { now })).toBe(false);
  });

  it("rejects timestamps more than five minutes away, either side", () => {
    const header = signMezoutPayload(body, secret, t);
    expect(verifyMezoutSignature(body, header, secret, { now: now + 300_000 })).toBe(true);
    expect(verifyMezoutSignature(body, header, secret, { now: now + 301_000 })).toBe(false);
    expect(verifyMezoutSignature(body, header, secret, { now: now - 301_000 })).toBe(false);
  });

  it("rejects missing or malformed headers and an empty secret", () => {
    const v1 = signMezoutPayload(body, secret, t).split("v1=")[1];
    for (const header of [null, undefined, "", `v1=${v1}`, `t=${t}`, `t=abc,v1=${v1}`, `t=${t},v1=zz`, `t=${t},v1=${v1.slice(2)}`]) {
      expect(verifyMezoutSignature(body, header, secret, { now })).toBe(false);
    }
    expect(verifyMezoutSignature(body, signMezoutPayload(body, "", t), "", { now })).toBe(false);
  });
});
