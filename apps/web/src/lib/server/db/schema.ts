import { bigint, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  payoutAddress: text("payout_address").notNull().unique(),
  // Shown to customers at checkout. Set by the merchant from the dashboard; self-declared, not verified.
  businessName: text("business_name"),
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
    // Where the checkout sends the customer after paying (the merchant's order page). Optional.
    successUrl: text("success_url"),
    token: text("token").notNull(),
    // The MezoutRouter the invoice was signed for, which records its payment. Rows from before routers were
    // tracked were all signed for the first router.
    router: text("router").notNull().default("0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when the invoice.expired event is recorded, so each expiry is announced once.
    expiredEventAt: timestamp("expired_event_at", { withTimezone: true }),
  },
  (t) => [index("invoices_merchant_idx").on(t.merchantId), index("invoices_token_idx").on(t.token)],
);

// One row per Paid event, written only by the indexer. An invoice is paid when a payment exists for its router and
// order id. Payments to links that were never stored (older dashboard links) have no invoice row.
export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    router: text("router").notNull(),
    orderId: text("order_id").notNull(),
    merchant: text("merchant").notNull(),
    payer: text("payer").notNull(),
    amount: numeric("amount", { precision: 78, scale: 0 }).notNull(),
    fee: numeric("fee", { precision: 78, scale: 0 }).notNull(),
    method: text("method").notNull(),
    assetIn: text("asset_in").notNull(),
    amountIn: numeric("amount_in", { precision: 78, scale: 0 }).notNull(),
    borrowed: numeric("borrowed", { precision: 78, scale: 0 }).notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("payments_router_order_uq").on(t.router, t.orderId),
    unique("payments_log_uq").on(t.txHash, t.logIndex),
    index("payments_merchant_idx").on(t.merchant),
  ],
);

// How far the indexer has read. blockTime is that block's timestamp: expiries before it can no longer be paid.
export const chainCursors = pgTable("chain_cursors", {
  name: text("name").primaryKey(),
  block: bigint("block", { mode: "number" }).notNull(),
  blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A refund is MUSD sent from the payout address back to the payer; Mezout never holds funds. A pending refund is a
// request (from the API) waiting for the merchant to send it; it completes once the transfer is verified on-chain,
// or is canceled.
export const refunds = pgTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id),
    amount: numeric("amount", { precision: 78, scale: 0 }).notNull(),
    reason: text("reason"),
    status: text("status").notNull(),
    txHash: text("tx_hash").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
  },
  (t) => [index("refunds_payment_idx").on(t.paymentId), index("refunds_merchant_idx").on(t.merchantId)],
);

// Dashboard sign-in. The cookie holds a random token; only its hash is stored.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    tokenHash: text("token_hash").notNull().unique(),
    // keccak256 of the signed sign-in message; stops the same signature opening two sessions.
    requestHash: text("request_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_merchant_idx").on(t.merchantId)],
);

// Each endpoint's signing secret is derived from WEBHOOK_SIGNING_SECRET and the endpoint id, so none is stored.
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [index("webhook_endpoints_merchant_idx").on(t.merchantId)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    type: text("type").notNull(),
    // e.g. "invoice.paid:inv_…"; makes recording an event idempotent when the indexer reads a block twice.
    dedupeKey: text("dedupe_key").notNull().unique(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_events_merchant_idx").on(t.merchantId)],
);

// One row per event and endpoint. status is pending until a 2xx, or failed once retries run out.
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id")
      .notNull()
      .references(() => webhookEvents.id),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("webhook_deliveries_uq").on(t.eventId, t.endpointId),
    index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
  ],
);

// The delivery log: every attempt and what the merchant's server answered.
export const webhookAttempts = pgTable(
  "webhook_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => webhookDeliveries.id),
    attempt: integer("attempt").notNull(),
    statusCode: integer("status_code"),
    error: text("error"),
    responseExcerpt: text("response_excerpt"),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_attempts_delivery_idx").on(t.deliveryId)],
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

// Shared fixed-window rate limits, so every server instance counts the same requests.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

// Idempotency-Key replays for POST /v1 requests: the first response is stored and returned again for 24 hours.
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    key: text("key").notNull(),
    // Method and path plus the SHA-256 of the body, so a reused key with a different request is refused.
    requestHash: text("request_hash").notNull(),
    // null while the first request is still running.
    status: integer("status"),
    body: jsonb("body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.key] })],
);
