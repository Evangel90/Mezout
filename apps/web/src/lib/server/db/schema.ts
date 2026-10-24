import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  payoutAddress: text("payout_address").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    // keccak256 of the wallet signature that requested the key; stops the same signature minting twice.
    requestHash: text("request_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_keys_merchant_idx").on(t.merchantId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().unique(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    amount: numeric("amount", { precision: 78, scale: 0 }).notNull(),
    fee: numeric("fee", { precision: 78, scale: 0 }).notNull(),
    currency: text("currency").notNull().default("MUSD"),
    reference: text("reference"),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoices_merchant_idx").on(t.merchantId)],
);
