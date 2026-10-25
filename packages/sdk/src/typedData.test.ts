import { describe, expect, it } from "vitest";
import { domainSeparator, hashTypedData, keccak256, parseEther, toHex } from "viem";
import {
  btcDomain,
  invoiceTypes,
  mezoDomain,
  paymentTypes,
  routerDomain,
  swapPaymentTypes,
  type Invoice,
} from "./typedData";
import { decodeSignedInvoice, encodeSignedInvoice, linkRouter } from "./link";
import { mezoTestnetAddresses } from "./addresses";

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

  it("hashes the swap payment", () => {
    expect(
      hashTypedData({
        domain: routerDomain(router),
        types: swapPaymentTypes,
        primaryType: "SwapPayment",
        message: {
          invoice,
          payer: "0x2222222222222222222222222222222222222222",
          tokenIn: mezoTestnetAddresses.mezoToken,
          maxAmountIn: parseEther("600"),
          deadline: 1_800_000_100n,
        },
      }),
    ).toBe("0xc0411bef459b070a7da8941dca9a7df6e94fed3cb1d27f4694609452db70d8f9");
  });
});

describe("permit domains match the testnet precompiles", () => {
  // DOMAIN_SEPARATOR() read from Mezo testnet on 25 Oct 2026.
  it("BTC", () => {
    expect(domainSeparator({ domain: btcDomain() })).toBe(
      "0xeabbeb8beb032911819a981b239a4c0fb26912f0117f32b2644286acfed48662",
    );
  });
  it("MEZO", () => {
    expect(domainSeparator({ domain: mezoDomain() })).toBe(
      "0xf427a251d92afad5215d916845be8b6a0ca6c255f8e6b5e9f1d793b89b59c9db",
    );
  });
});

describe("payment link token", () => {
  it("round-trips", () => {
    const signature = `0x${"ab".repeat(65)}` as const;
    expect(decodeSignedInvoice(encodeSignedInvoice({ invoice, signature }))).toEqual({ invoice, signature });
  });

  it("carries the router it was signed for", () => {
    const signature = `0x${"ab".repeat(65)}` as const;
    const r = "0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431";
    const signed = decodeSignedInvoice(encodeSignedInvoice({ invoice, signature, router: r }));
    expect(linkRouter(signed)).toBe(r);
  });

  it("treats links without a router as signed for the first router", () => {
    const signature = `0x${"ab".repeat(65)}` as const;
    expect(linkRouter(decodeSignedInvoice(encodeSignedInvoice({ invoice, signature })))).toBe(
      mezoTestnetAddresses.mezoutRouterV1,
    );
  });

  it("rejects a malformed order id", () => {
    const token = btoa(JSON.stringify({ m: invoice.merchant, a: "1", f: "0", o: "0x12", e: "1", s: "0x00" }));
    expect(() => decodeSignedInvoice(token)).toThrow();
  });
});
