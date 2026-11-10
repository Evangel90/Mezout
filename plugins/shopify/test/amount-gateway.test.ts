import { describe, expect, it } from "vitest";
import { amountsEqual, isPositiveAmount, normalizeAmount, sumAmounts } from "../app/mezout/amount";
import { DEFAULT_GATEWAY_NAME, isMezoutGateway, isSupportedCurrency } from "../app/mezout/gateway";
import { orderIdFrom, shopFromDest } from "../app/mezout/payment-link";
import { refundAmount } from "../app/mezout/refunds";

describe("amounts", () => {
  it("normalizes decimal strings", () => {
    expect(normalizeAmount("25.00")).toBe("25");
    expect(normalizeAmount("025.500")).toBe("25.5");
    expect(normalizeAmount("0.0")).toBe("0");
    expect(normalizeAmount(" 10 ")).toBe("10");
    expect(normalizeAmount("1e3")).toBeNull();
    expect(normalizeAmount("-5")).toBeNull();
    expect(normalizeAmount("")).toBeNull();
    expect(normalizeAmount(undefined)).toBeNull();
  });

  it("compares Shopify and Mezout formats as decimals", () => {
    expect(amountsEqual("25", "25.00")).toBe(true); // Mezout "25" vs Shopify webhook "25.00"
    expect(amountsEqual("25.5", "25.50")).toBe(true);
    expect(amountsEqual("25", "25.0")).toBe(true); // Shopify GraphQL money
    expect(amountsEqual("25", "25.01")).toBe(false);
    expect(amountsEqual("250", "25")).toBe(false);
    expect(amountsEqual("0.000000000000000001", "0")).toBe(false);
    expect(amountsEqual("abc", "abc")).toBe(false);
  });

  it("knows positive amounts", () => {
    expect(isPositiveAmount("0.01")).toBe(true);
    expect(isPositiveAmount("0.00")).toBe(false);
  });

  it("adds exactly", () => {
    expect(sumAmounts(["0.1", "0.2"])).toBe("0.3");
    expect(sumAmounts(["10.00", "5.5", "0.005"])).toBe("15.505");
    expect(sumAmounts(["1", "x"])).toBeNull();
  });
});

describe("gateway matching", () => {
  it("matches the configured manual payment method name, ignoring case and punctuation", () => {
    expect(isMezoutGateway(["Pay with Bitcoin or MUSD (Mezout)"], DEFAULT_GATEWAY_NAME)).toBe(true);
    expect(isMezoutGateway(["pay with bitcoin or musd  mezout"], DEFAULT_GATEWAY_NAME)).toBe(true);
    expect(isMezoutGateway(["Crypto on Mezo"], "Crypto on Mezo")).toBe(true);
  });

  it("matches any method with the word Mezout", () => {
    expect(isMezoutGateway(["Mezout"], "")).toBe(true);
    expect(isMezoutGateway(["gift_card", "Bitcoin (Mezout)"], "Something else")).toBe(true);
  });

  it("does not match other methods", () => {
    expect(isMezoutGateway(["manual"], DEFAULT_GATEWAY_NAME)).toBe(false);
    expect(isMezoutGateway(["Cash on Delivery (COD)"], DEFAULT_GATEWAY_NAME)).toBe(false);
    expect(isMezoutGateway(["bogus"], DEFAULT_GATEWAY_NAME)).toBe(false);
    expect(isMezoutGateway(["Mezoutish payments"], "")).toBe(false);
    expect(isMezoutGateway([], DEFAULT_GATEWAY_NAME)).toBe(false);
    expect(isMezoutGateway(undefined, DEFAULT_GATEWAY_NAME)).toBe(false);
    expect(isMezoutGateway([""], "")).toBe(false);
  });

  it("accepts USD only", () => {
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("usd")).toBe(true);
    expect(isSupportedCurrency("EUR")).toBe(false);
    expect(isSupportedCurrency("MUSD")).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
  });
});

describe("helpers", () => {
  it("parses order ids", () => {
    expect(orderIdFrom("gid://shopify/Order/123")).toBe("123");
    expect(orderIdFrom("gid://shopify/OrderIdentity/123")).toBe("123");
    expect(orderIdFrom("123")).toBe("123");
    expect(orderIdFrom("gid://shopify/Product/123")).toBeNull();
    expect(orderIdFrom(null)).toBeNull();
  });

  it("reads the shop from a session token's dest", () => {
    expect(shopFromDest("https://shop-1.myshopify.com")).toBe("shop-1.myshopify.com");
    expect(shopFromDest("shop-1.myshopify.com")).toBe("shop-1.myshopify.com");
    expect(shopFromDest(undefined)).toBeNull();
  });

  it("totals a Shopify refund's successful refund transactions", () => {
    expect(
      refundAmount({
        id: 1,
        order_id: 2,
        transactions: [
          { kind: "refund", status: "success", amount: "5.00" },
          { kind: "refund", status: "success", amount: "2.50" },
          { kind: "refund", status: "failure", amount: "100.00" },
          { kind: "sale", status: "success", amount: "40.00" },
        ],
      }),
    ).toBe("7.5");
    expect(refundAmount({ id: 1, order_id: 2, transactions: [] })).toBeNull();
    expect(refundAmount({ id: 1, order_id: 2 })).toBeNull();
  });
});
