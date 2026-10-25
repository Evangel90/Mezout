# Mezout merchant API (testnet)

Base URL: `https://usemezout.vercel.app` (or `http://localhost:3000` when running locally). Everything is on Mezo testnet; amounts are test MUSD.

## Get an API key

1. Open `/dashboard`, sign up with a passkey or connect the wallet that should receive MUSD, and click **Sign in**. Signing costs no gas. The address becomes your payout address.
2. Click **Create API key**.
3. Copy the key (`mzk_test_…`). It is shown once. Mezout stores only a SHA-256 hash of it.

Each payout address can hold up to 5 active keys. Every invoice created with a key pays that key's payout address; the request body cannot change it.

Send the key on every request:

```
Authorization: Bearer mzk_test_…
```

## Create an invoice

`POST /v1/invoices`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `amount` | string | yes | Decimal MUSD, e.g. `"25.00"`. Up to 18 decimals. |
| `currency` | string | no | Only `"MUSD"`. |
| `reference` | string | no | Your order number, up to 200 characters. Returned as is. |
| `expires_in` | integer | no | Seconds until the checkout link expires. 300 to 2,592,000 (30 days). Default 86,400 (24 hours). |

In your Mac terminal, in any folder (replace the key):

```
curl -s https://usemezout.vercel.app/v1/invoices \
  -H "Authorization: Bearer mzk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount":"25.00","reference":"order-1001","expires_in":3600}'
```

Response `201`:

```json
{
  "id": "inv_3bf9a158b706b1412e77528f",
  "object": "invoice",
  "order_id": "0x4f3d7953e110470549275f6172dff8cca526384ed77d0a98a07083d21b821623",
  "merchant": "0x7049Fcb3a331481a1EE860eb041cf0F9A133E264",
  "amount": "25",
  "fee": "0",
  "currency": "MUSD",
  "reference": "order-1001",
  "status": "pending",
  "checkout_url": "https://usemezout.vercel.app/pay/eyJtIjoi…",
  "expires_at": "2026-10-24T17:27:37.000Z",
  "created_at": "2026-10-24T16:27:37.382Z"
}
```

`amount_refunded` is `"0"` and `payment` is `null` until the invoice is paid (see below).

Send the customer to `checkout_url`. `order_id` is the id the `MezoutRouter` contract records when the invoice is paid, and appears in its `Paid` event.

## Retrieve an invoice

`GET /v1/invoices/:id`

In your Mac terminal, in any folder:

```
curl -s https://usemezout.vercel.app/v1/invoices/inv_3bf9a158b706b1412e77528f \
  -H "Authorization: Bearer mzk_test_YOUR_KEY"
```

Returns the same object. `status` is one of:

| Status | Meaning |
| --- | --- |
| `pending` | Not paid yet and the link is still valid. |
| `paid` | A `Paid` event for `order_id` is on Mezo testnet. The MUSD is in the payout address. |
| `expired` | Not paid and past `expires_at`. The router will reject payment. |
| `refunded` | Paid, and completed refunds add up to the full amount. |

Once paid, `payment` describes the on-chain payment:

```json
{
  "id": "pay_…",
  "object": "payment",
  "order_id": "0x4f3d…1623",
  "payer": "0x…",
  "method": "MEZO",
  "amount": "25",
  "asset_in": "0x7B7c000000000000000000000000000000000001",
  "amount_in": "25.18",
  "borrowed": "0",
  "router": "0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431",
  "tx_hash": "0x…",
  "block_number": 16400000,
  "paid_at": "2026-10-25T18:02:11.000Z"
}
```

`method` is `MUSD`, `BORROW`, `MEZO` or `BTC`. `amount` is what the merchant received. `asset_in` and `amount_in` are what the customer spent; for `BORROW`, `borrowed` is the MUSD drawn from their trove.

Status comes from Mezout's indexer, which reads the router's `Paid` events from Mezo testnet one block behind the head. A payment usually shows within seconds. Use webhooks rather than polling.

## List invoices

`GET /v1/invoices?limit=20&starting_after=inv_…`

Returns `{"object": "list", "data": [invoice, …], "has_more": true|false}`, newest first. `limit` is 1 to 100 (default 20). To get the next page, pass the last `id` as `starting_after`.

## Refunds

Mezout never holds funds, so a refund is a direct MUSD transfer from your payout address back to the customer. There are two steps:

1. **Request** (optional, from your server): `POST /v1/refunds` with `{"invoice": "inv_…", "amount": "5.00", "reason": "…"}`. Leave out `amount` to refund everything not yet refunded. Returns a `refund` with `status: "pending"`. Pending and completed refunds together cannot exceed the payment.
2. **Send**: in `/dashboard`, under **Orders**, click **Refund** on the order. This sends the MUSD from your payout address. Mezout then checks the transaction on-chain before marking the refund completed. The transaction must have succeeded, been mined after the payment, send MUSD from the payout address to the payer, and not already be recorded as a refund. A pending refund of the same amount is completed. Otherwise a new completed refund is recorded.

`GET /v1/refunds/:id` returns the refund:

```json
{
  "id": "re_…",
  "object": "refund",
  "invoice": "inv_…",
  "payment": "pay_…",
  "amount": "5",
  "reason": "damaged item",
  "status": "completed",
  "tx_hash": "0x…",
  "created_at": "…",
  "completed_at": "…"
}
```

When a refund completes, Mezout sends `refund.completed`.

## Webhooks

Mezout POSTs an event to your endpoints when something happens. Add up to 3 endpoints in `/dashboard` under **Webhooks**, or with the API:

In your Mac terminal, in any folder:

```
curl -s https://usemezout.vercel.app/v1/webhook_endpoints \
  -H "Authorization: Bearer mzk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://shop.example.com/mezout/webhook"}'
```

The response includes the endpoint's signing `secret` (`whsec_…`); the dashboard can show it again. `GET /v1/webhook_endpoints` lists endpoints and `DELETE /v1/webhook_endpoints/:id` removes one. URLs must be `https` and resolve to a public address.

### Events

| Type | When | `data.object` |
| --- | --- | --- |
| `invoice.paid` | The `Paid` event is indexed. | The invoice, with `payment`. |
| `invoice.expired` | An unpaid invoice passes `expires_at` (measured in chain time). | The invoice. |
| `refund.completed` | A refund is verified on-chain. | The refund, with `invoice` expanded. |
| `ping` | You click **Send test event** in the dashboard. | `{"object": "ping", …}` |

Every event has this shape and is sent at most once per endpoint (with retries):

```json
{ "id": "evt_…", "object": "event", "type": "invoice.paid", "created_at": "…", "data": { "object": { … } } }
```

Use `id` to ignore duplicates. Respond with any 2xx status within 10 seconds. If you don't, Mezout retries after 1, 2, 4, 8 minutes and so on, waiting at most 6 hours between tries, for up to 24 hours after the event. The dashboard's **Delivery log** shows each attempt and has **Retry now** for failed deliveries.

### Verifying signatures

Each request has these headers:

```
Mezout-Signature: t=1761415331,v1=5f0c…
Mezout-Event-Id: evt_…
Mezout-Event-Type: invoice.paid
```

`v1` is the hex HMAC-SHA256 of `"<t>.<raw request body>"` keyed with the endpoint secret. Recompute it from the raw body before you parse the JSON. Compare in constant time, and reject timestamps more than 5 minutes old.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMezout(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const ok = parts.v1?.length === expected.length && timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  return ok && Math.abs(Date.now() / 1000 - Number(parts.t)) <= toleranceSec;
}
```

## Errors

Errors return JSON `{"error": "<message>"}`.

| Code | When |
| --- | --- |
| 400 | Invalid body, e.g. a non-decimal amount or `expires_in` out of range, or a refund the invoice cannot take. |
| 401 | Missing, unknown or revoked API key. |
| 404 | No invoice, refund or endpoint with that id belongs to your payout address. |
| 429 | More than 120 requests per minute for one merchant. |
| 503 | Mezo testnet could not be read. Retry. |

## Dashboard sign-in and key issuance

The dashboard signs in with `POST /api/session` and `{"address", "issuedAt", "signature"}`, where `signature` signs this exact text:

```
Mezout: sign in to the dashboard
Payout address: <checksummed address>
Issued at: <issuedAt, ISO 8601 UTC with milliseconds>
Network: Mezo testnet (31611)
```

It sets an HttpOnly session cookie that lasts 12 hours. `signInMessage` in `@mezout/sdk` builds the text. Signed in, the dashboard creates keys with `POST /api/keys` and an empty body.

Without a session, `POST /api/keys` takes `{"address", "issuedAt", "signature"}`, where `signature` signs this exact text (EIP-191 `personal_sign`):

```
Mezout: create an API key
Payout address: <checksummed address>
Issued at: <issuedAt, ISO 8601 UTC with milliseconds>
Network: Mezo testnet (31611)
```

The request must be under 5 minutes old and each signed message can create one key. Smart-account signatures (ERC-1271 and ERC-6492, used by Bitcoin wallets in Mezo Passport) are accepted. `keyRequestMessage` in `@mezout/sdk` builds the text.

For a Mezout passkey account, `signature` is a WebAuthn assertion whose challenge is the message's EIP-191 hash (`hashMessage`), encoded with `encodeWebAuthnSignature` from `@mezout/sdk`. The server checks it against the passkey's registered public key, this site's domain and origin, and user verification.
