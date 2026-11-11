import { describe, expect, it } from "vitest";
import { keccak256, parseEther, recoverTypedDataAddress, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeSignedInvoice } from "./link";
import { paymentLinkToken, signMusdPayment } from "./pay";
import { decodeX402Header, encodeX402Header } from "./x402";
import { musdDomain, paymentTypes, permitTypes, routerDomain, type Invoice } from "./typedData";

const router = "0x000000000000000000000000000000000000bEEF";
const invoice: Invoice = {
  merchant: "0x1111111111111111111111111111111111111111",
  amount: parseEther("2.5"),
  fee: 0n,
  orderId: keccak256(toHex("pay-test")),
  expiry: 1_800_000_000n,
};
const token = encodeSignedInvoice({ invoice, signature: "0x01", router });

describe("signMusdPayment", () => {
  it("signs the Payment and an exact-amount permit to the link's router", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const body = await signMusdPayment({ token, signer: account, musdNonce: 7n, permitDeadline: 1_700_000_000n });
    expect(body).toMatchObject({ method: "MUSD", token, payer: account.address, permit: { deadline: "1700000000" } });

    const payer = await recoverTypedDataAddress({
      domain: routerDomain(router),
      types: paymentTypes,
      primaryType: "Payment",
      message: { invoice, payer: account.address },
      signature: body.payerSig,
    });
    expect(payer).toBe(account.address);

    const { v, r, s } = body.permit;
    const permitSig = (r + s.slice(2) + v.toString(16).padStart(2, "0")) as Hex;
    const owner = await recoverTypedDataAddress({
      domain: musdDomain(),
      types: permitTypes,
      primaryType: "Permit",
      message: { owner: account.address, spender: router, value: invoice.amount, nonce: 7n, deadline: 1_700_000_000n },
      signature: permitSig,
    });
    expect(owner).toBe(account.address);
  });
});

describe("x402 headers", () => {
  it("round-trips UTF-8 JSON through base64", () => {
    const value = { x402Version: 2, error: "Paiement requis — 0.05 MUSD" };
    const header = encodeX402Header(value);
    expect(header).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(decodeX402Header(header)).toEqual(value);
  });
});

describe("paymentLinkToken", () => {
  it("extracts the token from a checkout URL", () => {
    expect(paymentLinkToken(`https://usemezout.vercel.app/pay/${token}`)).toBe(token);
    expect(paymentLinkToken(`http://localhost:3000/pay/${token}?x=1`)).toBe(token);
    expect(paymentLinkToken(token)).toBe(token);
  });
});
