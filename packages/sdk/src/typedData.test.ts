import { describe, expect, it } from "vitest";
import { hashTypedData, keccak256, parseEther, toHex } from "viem";
import { invoiceTypes, paymentTypes, routerDomain, type Invoice } from "./typedData";
import { decodeSignedInvoice, encodeSignedInvoice } from "./link";

// Vectors from contracts/test/unit/TypedDataVectors.t.sol.
const router = "0x000000000000000000000000000000000000bEEF";
const invoice: Invoice = {
  merchant: "0x1111111111111111111111111111111111111111",
  amount: parseEther("123.45"),
  fee: parseEther("1.2345"),
  orderId: keccak256(toHex("order-vector")),
  expiry: 1_800_000_000n,
};

describe("typed data matches MezoutRouter", () => {
  it("hashes the invoice", () => {
    expect(
      hashTypedData({ domain: routerDomain(router), types: invoiceTypes, primaryType: "Invoice", message: invoice }),
    ).toBe("0x9c9d8d8d472a8ae2d7d56b0611899aa189f434140d2dab5d42b72511f0f90c61");
  });

  it("hashes the payment", () => {
    expect(
      hashTypedData({
        domain: routerDomain(router),
        types: paymentTypes,
        primaryType: "Payment",
        message: { invoice, payer: "0x2222222222222222222222222222222222222222" },
      }),
    ).toBe("0x49f60c72a2ae11ecacd6ec1e52abe9aa6c9b8092b5f7bf43359550b78025373f");
  });
});

describe("payment link token", () => {
  it("round-trips", () => {
    const signature = `0x${"ab".repeat(65)}` as const;
    expect(decodeSignedInvoice(encodeSignedInvoice({ invoice, signature }))).toEqual({ invoice, signature });
  });

  it("rejects a malformed order id", () => {
    const token = btoa(JSON.stringify({ m: invoice.merchant, a: "1", f: "0", o: "0x12", e: "1", s: "0x00" }));
    expect(() => decodeSignedInvoice(token)).toThrow();
  });
});
