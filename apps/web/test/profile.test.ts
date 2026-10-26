import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/server/db/client";
import { merchants } from "@/lib/server/db/schema";
import { checkoutDetails, normalizeBusinessName, ProfileError, setBusinessName } from "@/lib/server/profile";
import { testDb } from "./db";
import { makeInvoice, makeMerchant } from "./fixtures";

describe("business name", () => {
  it("tidies whitespace, clears on empty and caps the length", () => {
    expect(normalizeBusinessName("  Satoshi's   Coffee \n")).toBe("Satoshi's Coffee");
    expect(normalizeBusinessName("   ")).toBeNull();
    expect(normalizeBusinessName("☕ Café Ünï")).toBe("☕ Café Ünï");
    expect(normalizeBusinessName("x".repeat(64))).toHaveLength(64);
    expect(() => normalizeBusinessName("x".repeat(65))).toThrow(ProfileError);
  });

  it("refuses control characters and bidirectional overrides", () => {
    expect(() => normalizeBusinessName("Shop\u0000")).toThrow(ProfileError);
    expect(() => normalizeBusinessName("Shop ‮gnp.exe")).toThrow(ProfileError);
    expect(() => normalizeBusinessName("Shop⁦x⁩")).toThrow(ProfileError);
  });

  describe("stored", () => {
    let db: Db;
    beforeEach(async () => {
      db = await testDb();
    });

    it("is saved for the merchant and can be cleared", async () => {
      const m = await makeMerchant(db);
      expect(await setBusinessName(db, m, " Satoshi's Coffee ")).toBe("Satoshi's Coffee");
      expect((await db.query.merchants.findFirst({ where: eq(merchants.id, m.id) }))?.businessName).toBe("Satoshi's Coffee");
      expect(await setBusinessName(db, m, "")).toBeNull();
      expect((await db.query.merchants.findFirst({ where: eq(merchants.id, m.id) }))?.businessName).toBeNull();
    });

    it("shows the checkout the merchant's name and the invoice's reference", async () => {
      const m = await makeMerchant(db);
      await setBusinessName(db, m, "Satoshi's Coffee");
      const invoice = await makeInvoice(db, m, { reference: "Order 1001" });
      expect(await checkoutDetails(db, invoice.token, m.payoutAddress as `0x${string}`)).toEqual({
        businessName: "Satoshi's Coffee",
        reference: "Order 1001",
      });
      // Lowercase addresses from a link still find the merchant.
      expect((await checkoutDetails(db, invoice.token, m.payoutAddress.toLowerCase() as `0x${string}`)).businessName).toBe(
        "Satoshi's Coffee",
      );
    });

    it("does not show one merchant's reference on a link that pays another", async () => {
      const a = await makeMerchant(db);
      const b = await makeMerchant(db);
      const invoice = await makeInvoice(db, a, { reference: "A's order" });
      expect(await checkoutDetails(db, invoice.token, b.payoutAddress as `0x${string}`)).toEqual({
        businessName: null,
        reference: null,
      });
    });

    it("returns nothing for an unknown merchant", async () => {
      expect(await checkoutDetails(db, "tok", "0x000000000000000000000000000000000000dEaD")).toEqual({
        businessName: null,
        reference: null,
      });
    });
  });
});
