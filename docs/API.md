# Mezout API

Your server creates an invoice for an amount of MUSD. The customer pays it with MUSD, BTC or MEZO, or by borrowing MUSD against their BTC. Your payout address receives the amount less the invoice's platform fee, in one on-chain transaction through the `MezoutRouter` contract. Mezout never holds funds.

> **Testnet.** Mezout runs on Mezo testnet (chain 31611). Amounts are test MUSD with no value. Keys start with `mzk_test_`.

## Overview

1. **Create an invoice** with `POST /v1/invoices`.
2. **Send the customer to its `checkout_url`.** They choose how to pay and confirm in their wallet.
3. **The router settles it.** Your payout address gets the net amount, the fee goes to its recipient, and a `Paid` event records the invoice's `order_id` on Mezo.
4. **Mezout sends `invoice.paid`** to your webhook endpoint.
5. **Fulfil the order.** Polling `GET /v1/invoices/:id` also works, and is a good fallback if your server was down.

Your **payout address** is your Mezout passkey account, or the wallet you signed in with.

## Quickstart

**1. Get an API key.** Open [the dashboard](/dashboard), create an account with a passkey or sign in with a wallet, then on **Developers** click **Create API key**.

**2. Create an invoice:**

```bash
curl https://usemezout.vercel.app/v1/invoices \
  -H "Authorization: Bearer mzk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1001" \
  -d '{"amount": "25.00", "reference": "Order 1001"}'
```

**3. Open the `checkout_url`** from the response and pay with a Mezo testnet wallet (test tokens from [faucet.test.mezo.org](https://faucet.test.mezo.org)). The page shows **Payment complete** once the payment is on-chain.

**4. Check the invoice** with the `id` from step 2. `status` is now `paid` and `payment` describes the transaction:

```bash
curl https://usemezout.vercel.app/v1/invoices/inv_YOUR_INVOICE_ID \
  -H "Authorization: Bearer mzk_test_YOUR_KEY"
```

**5. Receive webhooks:** see [Receive your first webhook](#receive-your-first-webhook).

## Authentication

Send your API key as a bearer token: `Authorization: Bearer mzk_test_…`

- **Keep keys on your server.** A key can create invoices and request refunds for your account. Never put one in a browser, app or public repository.
- **Keys pay you.** Every invoice created with a key pays that account's payout address; a request cannot change it.
- **Keys are shown once.** Mezout stores only a SHA-256 hash, so a lost key cannot be recovered.
- **Manage keys** on the dashboard's **Developers** tab: up to 5 active keys per account. **Revoke** stops a key at once; requests with it get `401`.

To rotate a key, create a new one, deploy it, then revoke the old one.

## Requests and responses

- **Base URL** `https://usemezout.vercel.app`; every endpoint is under `/v1`. Bodies are JSON (`Content-Type: application/json`).
- **Amounts** are decimal strings of MUSD with up to 18 decimal places, such as `"25.00"`. Responses use the shortest form (`"25"`), so compare amounts as decimals, not strings.
- **Times** are ISO 8601 in UTC. **IDs** are prefixed by type: `inv_` invoice, `pay_` payment, `re_` refund, `evt_` event, `we_` webhook endpoint.
- **New fields** can appear on any object. Ignore fields you don't use.

## Errors

Errors return `{ "error": "<readable message>" }`.

| Status | Meaning | What to do |
| --- | --- | --- |
| `400` | Invalid request: a bad field, a `starting_after` that is not one of your invoices, or a refund the invoice cannot take. | Fix the request. |
| `401` | API key missing, unknown or revoked. | Check the `Authorization` header. |
| `403` | A dashboard-session request from another site. API-key requests never get this. | Use an API key from your server. |
| `404` | No invoice, refund or endpoint with that id belongs to your account. | Check the id and the key. |
| `409` | Conflicts with the current state: a refund no longer pending, or an `Idempotency-Key` request still running. | Read the object again, or retry shortly. |
| `422` | The `Idempotency-Key` was used with a different request. | Use a new key. |
| `429` | Rate limited. | Wait `Retry-After` seconds. |
| `500` | Mezout-side error. | Retry with the same `Idempotency-Key`. |

**Rate limits.** 120 requests a minute per account across all its keys; over that, `429` with `Retry-After` (seconds until the next minute).

**Idempotency.** Send an `Idempotency-Key` header (1 to 255 printable ASCII characters, such as your order number) with `POST /v1/invoices` and `POST /v1/refunds`. Retries with the same key return the first response with `Idempotent-Replayed: true`. Keys are per account and kept 24 hours. Reusing one with a different body or endpoint returns `422`; a retry while the first request runs returns `409`. `4xx` answers are replayed like successes; a `500` is not stored, so a retry runs again.

**Pagination.** `GET /v1/invoices` returns `{ "object": "list", "data": [...], "has_more": true }`, newest first. `limit` is 1 to 100 (default 20). When `has_more` is `true`, pass the last `id` as `starting_after`.

## Invoices

### The invoice object

```json
{
  "id": "inv_3bf9a158b706b1412e77528f",
  "object": "invoice",
  "order_id": "0x4f3d7953e110470549275f6172dff8cca526384ed77d0a98a07083d21b821623",
  "merchant": "0x7049Fcb3a331481a1EE860eb041cf0F9A133E264",
  "amount": "25",
  "fee": "0.25",
  "net": "24.75",
  "currency": "MUSD",
  "reference": "Order 1001",
  "status": "pending",
  "amount_refunded": "0",
  "payment": null,
  "checkout_url": "https://usemezout.vercel.app/pay/eyJtIjoi…",
  "success_url": "https://shop.example.com/orders/1001/thanks",
  "expires_at": "2026-10-25T16:27:37.000Z",
  "created_at": "2026-10-24T16:27:37.382Z"
}
```

| Field | Description |
| --- | --- |
| `order_id` | The id the router records on-chain in the `Paid` event. |
| `merchant` | Your payout address. |
| `amount` | What the customer pays, in MUSD. |
| `fee` | Platform fee, signed into the invoice and deducted from `amount`. New testnet invoices default to 1% (`MERCHANT_FEE_BPS=100`). |
| `net` | What reaches your payout address: `amount` minus `fee`. |
| `reference` | Your order number or note, or `null`. **Shown to the customer.** |
| `status` | `pending`, `paid`, `expired` or `refunded`. See [Invoice status](#invoice-status). |
| `amount_refunded` | MUSD refunded so far (completed refunds only). |
| `payment` | The [payment](#the-payment-object) once paid, otherwise `null`. |
| `checkout_url` | Where to send the customer. |
| `success_url` | Where checkout sends the customer after paying, or `null`. |
| `expires_at` | After this, the link can no longer be paid. |

### Create an invoice

`POST /v1/invoices` returns `201` with the invoice. Send an `Idempotency-Key` so a retry can't create a second one.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `amount` | string | Yes | MUSD to charge, greater than 0, such as `"25.00"`. |
| `currency` | string | No | Only `"MUSD"`. |
| `reference` | string | No | Up to 200 characters. Shown to the customer and returned as is. |
| `success_url` | string | No | Up to 2,000 characters. `https` (`http` only for `localhost`). |
| `expires_in` | integer | No | Seconds until expiry, 300 (5 minutes) to 2,592,000 (30 days). Default 86,400 (24 hours). |

### Retrieve and list invoices

- `GET /v1/invoices/:id` returns the invoice. If the indexer is behind, Mezout reads Mezo first, so a payment confirmed seconds ago already shows `paid`.
- `GET /v1/invoices?limit=20&starting_after=inv_…` lists your invoices, newest first.

### Invoice status

| Status | Meaning |
| --- | --- |
| `pending` | Not paid, and still payable. |
| `paid` | Paid on-chain; the MUSD is in your payout address. A partly refunded invoice stays `paid`. |
| `expired` | Not paid before `expires_at`. The router rejects payment, so it can never become paid. |
| `refunded` | Completed refunds add up to the full amount. |

The router accepts payment up to and including the second of `expires_at`; the API reports `expired` from the next second. `invoice.expired` waits until Mezo's chain time has passed `expires_at`, so it can arrive a few minutes later.

### Checkout and the success URL

`checkout_url` shows your business name, the amount, the `reference` and how long the link is valid. The customer sees only the payment methods their wallet can use; whichever they choose, you receive `amount` in MUSD less the fee. After payment the page shows **Payment complete** and, if you set `success_url`, a **Return to (your business name)** button.

> **A visit to `success_url` is not proof of payment.** Anyone can open a URL. Fulfil from the `invoice.paid` webhook or `GET /v1/invoices/:id`.

### Embedded checkout

Add your store's origin under **Dashboard → Developers → Embedded checkout sites**, then load the script and pass it an invoice's `checkout_url`:

```html
<script src="https://usemezout.vercel.app/mezout.js"></script>
<button data-mezout-checkout="CHECKOUT_URL">Pay with Mezout</button>
```

For custom controls call `Mezout.open({ checkoutUrl, onPaid, onClose })`. The modal offers **Open in new window** for wallets that can't run in an iframe. React apps can use `@mezout/embed-react`:

```tsx
<MezoutCheckout checkoutUrl={invoice.checkout_url} open={open} onClose={() => setOpen(false)} onPaid={() => setPaid(true)} />
```

Checkout posts `mezout:paid` and `mezout:closed` messages to the approved parent site. They are for interface updates only, since browser messages can be forged: fulfil from the webhook or a server-side lookup.

## Payments

### The payment object

An invoice's `payment`:

```json
{
  "id": "pay_…",
  "object": "payment",
  "order_id": "0x4f3d…1623",
  "payer": "0x5a1c…77e0",
  "method": "MEZO",
  "amount": "25",
  "fee": "0.25",
  "net": "24.75",
  "asset_in": "0x7B7c000000000000000000000000000000000001",
  "amount_in": "25.18",
  "borrowed": "0",
  "router": "0x7151473F1300c2529A2eEFaA517684e974A9b3E6",
  "tx_hash": "0x…",
  "block_number": 16400000,
  "paid_at": "2026-10-24T16:31:02.000Z"
}
```

| Field | Description |
| --- | --- |
| `payer` | The address that paid. Refunds go back to it. |
| `method` | `MUSD`, `BTC`, `MEZO` or `BORROW`. |
| `amount`, `fee`, `net` | The invoice amount, Mezout's fee, and what reached your payout address. |
| `asset_in`, `amount_in` | The token and amount the customer spent; for `BTC` and `MEZO`, including the swap on Tigris. |
| `borrowed` | For `BORROW`, the MUSD drawn from the customer's Mezo trove; otherwise `"0"`. |
| `router` | The `MezoutRouter` that took the payment. |
| `tx_hash`, `block_number`, `paid_at` | The transaction on the [Mezo testnet explorer](https://explorer.test.mezo.org), and its block time. |

### Verify a payment

`POST /v1/verify` tells your server whether one of your invoices is paid, for example before an HTTP 402 paywall releases a response. It is read-only and records nothing, so your server must accept each invoice only once. [`@mezout/paywall`](https://github.com/Evangel90/Mezout/tree/main/packages/paywall) does this for you.

```bash
curl https://usemezout.vercel.app/v1/verify \
  -H "Authorization: Bearer $MEZOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"invoice": "inv_…", "transaction": "0x…"}'
```

| Field | Description |
| --- | --- |
| `invoice` | Required. One of your invoice IDs. |
| `transaction` | Optional. The hash the payer says paid it. If the indexer hasn't seen the payment yet, Mezout reads this transaction's receipt and requires the invoice router's `Paid` event for this order, merchant and amount. |

The x402 facilitator form `{"x402Version": 2, "paymentPayload": …, "paymentRequirements": …}` is also accepted; the requirements are then checked against the invoice.

The response is `{"object": "verification", "isValid": true, "payer", "network", "transaction", "payment", "invoice"}`, or `{"object": "verification", "isValid": false, "invalidReason", "message", "network", "invoice"}` where `invalidReason` is one of `invoice_not_paid`, `invoice_expired`, `invoice_refunded`, `requirements_mismatch`, `transaction_not_found`, `transaction_failed` or `transaction_mismatch`. An unknown invoice returns `404`.

## Refunds

Mezout never holds your funds, so it can't send a refund for you. A refund is MUSD you send from your payout address back to the payment's `payer`; Mezout verifies the transfer on-chain and records it. Either:

- **Refund from the dashboard.** On **Payments**, open the payment and click **Refund**. It completes once the transfer is verified.
- **Request from your server.** `POST /v1/refunds` creates a `pending` refund. Open the payment on **Payments** and click **Send requested refund**, or **Decline request** to cancel it.

Mezout sends `refund.completed` when a refund completes and `refund.canceled` when a request is canceled or declined.

### The refund object

```json
{
  "id": "re_9d2c41a0b7e3f5c8a1d6e4b2",
  "object": "refund",
  "invoice": "inv_3bf9a158b706b1412e77528f",
  "payment": "pay_…",
  "amount": "5",
  "reason": "Damaged item",
  "status": "completed",
  "tx_hash": "0x…",
  "created_at": "2026-10-24T17:00:00.000Z",
  "completed_at": "2026-10-24T17:05:12.000Z",
  "canceled_at": null
}
```

| Status | Meaning |
| --- | --- |
| `pending` | Requested, waiting to be sent from the dashboard. Its amount is reserved, so other refunds can't exceed the payment. |
| `completed` | The transfer is on-chain; `tx_hash` is the transaction. |
| `canceled` | Canceled; nothing was sent. |

A refund completes only if its transaction succeeded, was mined after the payment, moved MUSD from your payout address to the payer, and isn't already recorded as another refund. Sending a pending refund requires a transfer of exactly its amount.

### Refund endpoints

`POST /v1/refunds` returns `201` with a `pending` refund. Pending and completed refunds together can't exceed the payment. Send an `Idempotency-Key`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `invoice` | string | Yes | A paid invoice's id. |
| `amount` | string | No | MUSD to refund. Defaults to everything not yet refunded or requested. |
| `reason` | string | No | A note for your records, up to 200 characters. |

- `GET /v1/refunds/:id` returns a refund.
- `POST /v1/refunds/:id/cancel` cancels a `pending` refund, frees its amount, sends `refund.canceled` and returns the refund. A `completed` or `canceled` refund returns `409`.

## Webhooks

Mezout POSTs an event to your endpoints when something happens, so your store can fulfil orders without anyone watching the dashboard.

### Receive your first webhook

[`examples/webhook-receiver/server.mjs`](https://github.com/Evangel90/Mezout/blob/main/examples/webhook-receiver/server.mjs) is a dependency-free receiver that verifies signatures, ignores duplicates and logs what it would fulfil.

1. **Expose it.** Mezout only delivers to public `https` URLs. Run a tunnel such as [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/):

   ```bash
   cloudflared tunnel --url http://localhost:4242
   ```

   On the dashboard's **Developers** tab, add the printed URL followed by `/webhooks/mezout` as an endpoint, and copy its signing secret (`whsec_…`).

2. **Start the receiver** in `examples/webhook-receiver`:

   ```bash
   MEZOUT_WEBHOOK_SECRET=whsec_YOUR_SECRET node server.mjs
   ```

3. **Click Send test event** on the dashboard. The receiver logs `test event from the dashboard` and the endpoint's **Delivery log** shows `200`.

4. **Pay an invoice** as in the [Quickstart](#quickstart). The receiver logs `fulfil Order 1001: 25 MUSD paid by 0x…`.

### Events

| Type | Sent when | `data.object` |
| --- | --- | --- |
| `invoice.paid` | An invoice's payment is on-chain. | The invoice, with `payment`. |
| `invoice.expired` | An invoice was not paid before `expires_at` (Mezo chain time). | The invoice. |
| `refund.completed` | A refund's transfer is verified on-chain. | The refund, with `invoice` as the full invoice. |
| `refund.canceled` | A pending refund is canceled through the API or declined on the dashboard. | The refund, with `invoice` as the full invoice. |
| `ping` | You click **Send test event** on the dashboard. | `{"object": "ping", …}` |

Each event goes to every endpoint you had when it happened. New types may be added; ignore ones you don't handle.

### The event object

```json
{
  "id": "evt_5c0b7e1a9f3d42e6b8a1c7d2",
  "object": "event",
  "type": "invoice.paid",
  "created_at": "2026-10-24T16:31:04.120Z",
  "data": {
    "object": {
      "id": "inv_3bf9a158b706b1412e77528f",
      "object": "invoice",
      "status": "paid",
      "amount": "25",
      "reference": "Order 1001",
      "payment": { "id": "pay_…", "payer": "0x5a1c…77e0", "net": "24.75", "tx_hash": "0x…" }
    }
  }
}
```

`data.object` is a snapshot from when the event happened; retries send the same body. For the current state, call `GET /v1/invoices/:id`.

| Header | Value |
| --- | --- |
| `Mezout-Signature` | `t=<unix seconds>,v1=<hex signature>`. See [Verify signatures](#verify-signatures). |
| `Mezout-Event-Id` | The event's `id`. |
| `Mezout-Event-Type` | The event's `type`. |
| `Content-Type` | `application/json` |
| `User-Agent` | `Mezout-Webhooks/1` |

### Handle events

1. **Verify the signature** against the raw body before parsing it. Answer `400` if it fails.
2. **Ignore duplicates** by event `id`: answer `200` and do nothing if you've seen it.
3. **Check the details.** For `invoice.paid`, find your order by `data.object.id` or `reference` and check `amount`.
4. **Answer `2xx` within 10 seconds.** For slow work, save the event, answer `200`, then process it.

### Delivery and retries

- **At least once.** Mezout retries until your endpoint answers `2xx`, so an event can arrive more than once.
- **Timing.** Mezout checks Mezo about every 5 minutes, and immediately when a customer pays through checkout, so `invoice.paid` usually arrives within seconds. `invoice.expired` can arrive several minutes after `expires_at`.
- **Retries.** After a failure (non-`2xx`, timeout or connection error), Mezout waits about 1, 2, 4, 8… minutes, at most 6 hours apart, until 24 hours after the event, then marks the delivery failed. Retries go out on the next 5-minute check after they are due.
- **Retry by hand.** Each endpoint's **Delivery log** shows every attempt with its status code and the start of your response; **Retry now** resends a failed delivery.
- **Order is not guaranteed.** Use each object's `status` and timestamps, not arrival order.
- **No backfill.** A new endpoint only gets events from then on. To catch up after downtime, list invoices.

### Verify signatures

`v1` is the hex HMAC-SHA256 of `<t>.<raw body>`, keyed with the endpoint's signing secret. Split the header on `,` and `=`, compute the HMAC over the **raw body exactly as received** (re-serialised JSON breaks it), compare in constant time, and reject a `t` more than 5 minutes from your clock.

Node.js (from the example receiver):

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMezoutSignature(rawBody, header, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const parts = Object.fromEntries(
    String(header ?? "")
      .split(",")
      .map((p) => p.split("=", 2)),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || typeof parts.v1 !== "string") return false;
  if (Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return parts.v1.length === expected.length && timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}
```

PHP:

```php
function mezout_verify(string $rawBody, string $header, string $secret, int $tolerance = 300): bool {
    $parts = [];
    foreach (explode(',', $header) as $pair) {
        [$k, $v] = array_pad(explode('=', $pair, 2), 2, '');
        $parts[$k] = $v;
    }
    if (!isset($parts['t'], $parts['v1']) || !ctype_digit($parts['t'])) return false;
    if (abs(time() - (int) $parts['t']) > $tolerance) return false;
    $expected = hash_hmac('sha256', $parts['t'] . '.' . $rawBody, $secret);
    return hash_equals($expected, $parts['v1']);
}
// $rawBody = file_get_contents('php://input');
```

Python:

```python
import hashlib, hmac, time

def mezout_verify(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    t, v1 = parts.get("t", ""), parts.get("v1", "")
    if not t.isdigit() or abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)
```

### Signing secrets

Each endpoint has its own secret (`whsec_…`), shown when you add it and again with **Show secret**. Keep it on your server. If it leaks, delete the endpoint and add it again to get a new secret.

## Webhook endpoints

Manage endpoints on the dashboard or with the API; up to 3 per account.

```json
{
  "id": "we_8f1e2d3c4b5a69788796a5b4",
  "object": "webhook_endpoint",
  "url": "https://shop.example.com/webhooks/mezout",
  "secret": "whsec_…",
  "created_at": "2026-10-24T16:00:00.000Z"
}
```

- `POST /v1/webhook_endpoints` with `{"url": "https://…"}` returns `201` with the endpoint and its `secret` (the only response that includes it). The URL must be `https`, without a username or password, and resolve only to public internet addresses; Mezout checks this on creation and on every delivery.
- `GET /v1/webhook_endpoints` lists your endpoints.
- `DELETE /v1/webhook_endpoints/:id` stops deliveries at once; queued deliveries are marked failed.

## AI agents

AI agents can use Mezout in two ways: an agent pays invoices and runs your Mezout account through the **MCP server**, and your API charges agents per request with an **HTTP 402 paywall**. Both run on Mezo testnet.

### Set up the MCP server

The MCP server gives Claude, Cursor or any other MCP client these tools:

| Tool | Needs | What it does |
| --- | --- | --- |
| `create_invoice`, `get_invoice`, `list_invoices` | API key | Create a payment link, check its status, list invoices |
| `refund`, `verify_payment` | API key | Request a refund; check whether an invoice is paid |
| `pay_invoice` | Payer key | Pay a Mezout payment link in MUSD, with no gas |
| `fetch_paid_resource` | Payer key | Fetch a URL, paying its HTTP 402 Mezout paywall on the way |
| `get_budget` | Payer key | Show the payer address and how much of the spending limit is left |

You need [Node.js](https://nodejs.org) 20 or later. The server is published on npm as [`@mezout/mcp`](https://www.npmjs.com/package/@mezout/mcp), and your agent starts it with `npx`, so there is nothing to download or build. Give it an API key, a payer key or both, depending on which tools you want.

**1. Get your keys.**

- **API key** (to take payments): on the [dashboard](https://usemezout.vercel.app/dashboard), open **Developers** and create a key. It starts with `mzk_test_`.
- **Payer key** (to make payments): create a new wallet used only for testing, for example a fresh account in MetaMask, and export its private key. Get test BTC and MUSD for it from [faucet.test.mezo.org](https://faucet.test.mezo.org). Never use a wallet that holds real funds.

**2. Add it to your agent.** It works with any agent that can run a local MCP server, including Claude, Codex, Cursor and Hermes Agent. Replace the keys in the examples below.

**Claude Code.** Run this in any terminal:

```bash
claude mcp add mezout \
  -e MEZOUT_API_KEY=mzk_test_YOUR_KEY \
  -e MEZOUT_PAYER_PRIVATE_KEY=0xYOUR_TEST_WALLET_KEY \
  -e MEZOUT_MAX_PAYMENT_MUSD=1 \
  -e MEZOUT_MAX_SESSION_MUSD=5 \
  -- npx -y @mezout/mcp
```

**Claude Desktop, Cursor and other clients.** Add this to the client's MCP settings file (in Claude Desktop: **Settings → Developer → Edit Config**), then restart the client:

```json
{
  "mcpServers": {
    "mezout": {
      "command": "npx",
      "args": ["-y", "@mezout/mcp"],
      "env": {
        "MEZOUT_API_KEY": "mzk_test_YOUR_KEY",
        "MEZOUT_PAYER_PRIVATE_KEY": "0xYOUR_TEST_WALLET_KEY",
        "MEZOUT_MAX_PAYMENT_MUSD": "1",
        "MEZOUT_MAX_SESSION_MUSD": "5"
      }
    }
  }
}
```

**Codex** (Codex CLI, the IDE extension and the ChatGPT desktop app share one config). Run this in any terminal:

```bash
codex mcp add mezout \
  --env MEZOUT_API_KEY=mzk_test_YOUR_KEY \
  --env MEZOUT_PAYER_PRIVATE_KEY=0xYOUR_TEST_WALLET_KEY \
  --env MEZOUT_MAX_PAYMENT_MUSD=1 \
  --env MEZOUT_MAX_SESSION_MUSD=5 \
  -- npx -y @mezout/mcp
```

Or add it to `~/.codex/config.toml` yourself:

```toml
[mcp_servers.mezout]
command = "npx"
args = ["-y", "@mezout/mcp"]

[mcp_servers.mezout.env]
MEZOUT_API_KEY = "mzk_test_YOUR_KEY"
MEZOUT_PAYER_PRIVATE_KEY = "0xYOUR_TEST_WALLET_KEY"
MEZOUT_MAX_PAYMENT_MUSD = "1"
MEZOUT_MAX_SESSION_MUSD = "5"
```

**Hermes Agent** (Nous Research). Add this under `mcp_servers` in `~/.hermes/config.yaml`, then run `/reload-mcp` in Hermes or start a new session:

```yaml
mcp_servers:
  mezout:
    command: "npx"
    args: ["-y", "@mezout/mcp"]
    env:
      MEZOUT_API_KEY: "mzk_test_YOUR_KEY"
      MEZOUT_PAYER_PRIVATE_KEY: "0xYOUR_TEST_WALLET_KEY"
      MEZOUT_MAX_PAYMENT_MUSD: "1"
      MEZOUT_MAX_SESSION_MUSD: "5"
```

Agents that only connect to MCP servers hosted on the internet, such as Grok and the Muse app, can't use it yet: the server runs on your machine so that the payer key never leaves it.

**3. Try it.** Ask your agent:

> Create a Mezout invoice for 0.5 MUSD for "Test order", then pay it and tell me the transaction.

The agent creates the invoice, pays it from the test wallet and returns a link to the transaction on the Mezo explorer. The invoice appears as paid on your dashboard.

**Settings**

| Variable | Default | Description |
| --- | --- | --- |
| `MEZOUT_API_KEY` | none | Your `mzk_test_` key, for the merchant tools |
| `MEZOUT_PAYER_PRIVATE_KEY` | none | The test wallet's private key, for the payer tools |
| `MEZOUT_MAX_PAYMENT_MUSD` | `1` | Largest single payment the agent may make |
| `MEZOUT_MAX_SESSION_MUSD` | `10` | Total the agent may spend until the server restarts |
| `MEZOUT_API_URL` | `https://usemezout.vercel.app` | The Mezout app to use |
| `MEZO_RPC_URL` | `https://rpc.test.mezo.org` | Mezo testnet RPC |

**Safety.**
- **Where it pays:** the agent pays only on Mezo testnet, only through Mezout's own contracts, and only within the limits above.
- **What leaves your machine:** the private key never does. Each payment sends two signatures, and only to Mezout's relay.
- **What it refuses:** expired or already-paid invoices, and payments the wallet can't cover.

### Charge agents per request

[`@mezout/paywall`](https://github.com/Evangel90/Mezout/tree/main/packages/paywall) puts a price on an API route. A request without payment gets `402 Payment Required` with a Mezout invoice in the [x402 v2](https://github.com/x402-foundation/x402/tree/main/specs) format. The agent pays it, for example with `fetch_paid_resource`, and retries with proof. The paywall confirms the payment with [`POST /v1/verify`](#verify-a-payment) and serves the request once per invoice.

Next.js (App Router):

```ts
import { withMezout402 } from "@mezout/paywall/next";

export const GET = withMezout402({ apiKey: process.env.MEZOUT_API_KEY!, price: "0.05" }, async (req, ctx, payment) =>
  Response.json({ report, paidBy: payment.payer }),
);
```

Express:

```ts
import { mezout402 } from "@mezout/paywall/express";

app.get("/report", mezout402({ apiKey: process.env.MEZOUT_API_KEY!, price: "0.05" }), (req, res) => {
  res.json({ report, paidBy: req.mezout!.payer });
});
```

The paywall uses its own `mezout` payment scheme inside the x402 format, because Mezout pays merchants through its router against a signed invoice. Agents that only support x402's `exact` scheme can't pay it. The package README has the details.

## Testing

Everything is on testnet, so create and pay as many invoices as you like. **Send test event** on the dashboard sends a `ping`; `"expires_in": 300` makes a link expire after 5 minutes, followed by `invoice.expired`; refund a paid test invoice from **Payments**.

## Versioning

The API is versioned in the path (`/v1`). Within `v1`, Mezout may add endpoints, optional parameters, fields and event types; breaking changes come in a new version. See the [changelog](https://github.com/Evangel90/Mezout/blob/main/CHANGELOG.md).

## Limits

| Limit | Value |
| --- | --- |
| Requests | 120 a minute per account |
| API keys | 5 active per account |
| Webhook endpoints | 3 per account |
| Embedded checkout sites | 10 per account |
| Invoice lifetime | 5 minutes to 30 days (default 24 hours) |
| `reference`, refund `reason` | 200 characters |
| `success_url` | 2,000 characters |
| Webhook response time | 10 seconds |
| Webhook retries | Up to 24 hours after the event |
| Idempotency keys | Kept 24 hours |
