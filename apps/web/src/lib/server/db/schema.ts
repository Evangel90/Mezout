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
    // The MezoutRouter the invoice was signed for, which records its payment. Rows from before routers were
    // tracked were all signed for the first router.
    router: text("router").notNull().default("0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoices_merchant_idx").on(t.merchantId)],
);

// A merchant whose payout address is a MezoutAccount owned by a passkey. The public key is only revealed when the
// passkey is created, so it is stored here; it is public data, not a secret.
export const passkeys = pgTable(
  "passkeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    // Not unique: credential ids are client-reported, so a stranger could register someone else's id with their own
    // key. Lookups return every match and the client keeps the one whose key verifies its assertion.
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull().unique(),
    accountAddress: text("account_address").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("passkeys_credential_idx").on(t.credentialId)],
);
