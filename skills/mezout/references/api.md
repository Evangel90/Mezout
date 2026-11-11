# Mezout REST API (v1)

Base URL `https://usemezout.vercel.app`. Every request: `Authorization: Bearer mzk_test_…`; bodies are JSON with `Content-Type: application/json`. Full reference: https://usemezout.vercel.app/docs

## Endpoints

| Method and path | Does | Success |
| --- | --- | --- |
| `POST /v1/invoices` | Create an invoice | `201` invoice |
| `GET /v1/invoices/:id` | Retrieve one (reads Mezo if the indexer lags, so a payment seconds old shows `paid`) | `200` invoice |
| `GET /v1/invoices?limit=20&starting_after=inv_…` | List, newest first | `200` list |
| `POST /v1/verify` | Is this invoice paid (by this transaction)? Read-only | `200` verification |
| `POST /v1/refunds` | Request a refund of a paid invoice | `201` refund (`pending`) |
| `GET /v1/refunds/:id` | Retrieve a refund | `200` refund |
| `POST /v1/refunds/:id/cancel` | Cancel a `pending` refund | `200` refund (`canceled`) |
| `POST /v1/webhook_endpoints` | Add an endpoint `{"url": "https://…"}`; the only response with its `secret` | `201` endpoint |
| `GET /v1/webhook_endpoints` | List endpoints | `200` list |
| `DELETE /v1/webhook_endpoints/:id` | Remove one; queued deliveries are marked failed | `200` `{"id", "object", "deleted": true}` |

## Create an invoice: `POST /v1/invoices`

| Field | Required | Rules |
| --- | --- | --- |
| `amount` | yes | Decimal string > 0, up to 18 decimals, e.g. `"25.00"` |
| `currency` | no | Only `"MUSD"` |
| `reference` | no | Up to 200 chars. **Shown to the payer**; returned as is. Put your order number here. |
| `success_url` | no | Up to 2,000 chars, `https` (`http` only for `localhost`). Checkout shows a "Return to …" button after payment. |
| `expires_in` | no | Seconds, 300 to 2,592,000. Default 86,400 (24 h). |

Send `Idempotency-Key: <1-255 printable ASCII>` (your order id). A retry with the same key returns the first response with `Idempotent-Replayed: true`; the same key with a different body or endpoint is `422`; a retry while the first is running is `409`. Keys are per account and kept 24 hours. `4xx` answers are replayed; a `500` isn't stored, so retrying runs again.

### The invoice object

```json
{
  "id": "inv_3bf9a158b706b1412e77528f",
  "object": "invoice",
  "order_id": "0x4f3d…1623",
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

- `order_id`: the id the router records on-chain in its `Paid` event. `merchant`: the payout address (fixed by the API key; a request can't change it).
- `amount` is what the payer pays; `fee` (1% by default on testnet, signed into the invoice) is deducted; `net` reaches the merchant.
- `amount_refunded` counts completed refunds only. `payment` is set once paid.

### Status

| Status | Meaning |
| --- | --- |
| `pending` | Not paid, still payable |
| `paid` | Paid on-chain; the MUSD is in the payout address. A partly refunded invoice stays `paid`. |
| `expired` | Not paid by `expires_at`; the router rejects payment, so it can never become `paid` |
| `refunded` | Completed refunds add up to the full amount |

The router accepts payment up to and including the second of `expires_at`; the API reports `expired` from the next second. The `invoice.expired` webhook waits for Mezo chain time, so it can arrive minutes later.

### The payment object (`invoice.payment`)

```json
{
  "id": "pay_…", "object": "payment", "order_id": "0x4f3d…1623", "payer": "0x5a1c…77e0",
  "method": "MEZO", "amount": "25", "fee": "0.25", "net": "24.75",
  "asset_in": "0x7B7c000000000000000000000000000000000001", "amount_in": "25.18", "borrowed": "0",
  "router": "0x7151473F1300c2529A2eEFaA517684e974A9b3E6",
  "tx_hash": "0x…", "block_number": 16400000, "paid_at": "2026-10-24T16:31:02.000Z"
}
```

`method` is `MUSD`, `BTC`, `MEZO` or `BORROW`. `payer` is where refunds go. `asset_in`/`amount_in` are what the payer spent (including the Tigris swap for BTC and MEZO); `borrowed` is the MUSD drawn from the payer's Mezo trove for `BORROW`. `tx_hash` is on `https://explorer.test.mezo.org/tx/<hash>`.

## List and paginate

`GET /v1/invoices` returns `{"object": "list", "data": [...], "has_more": true}`. `limit` 1 to 100 (default 20). While `has_more` is true, pass the last `id` as `starting_after`.

## Checkout

`checkout_url` shows the merchant's name, amount, `reference` and time left; the payer sees only the methods their wallet can use. Whatever they choose, the merchant gets `amount` in MUSD less the fee.

**Embedded checkout.** Add the store's origin under Dashboard → Developers → Embedded checkout sites (up to 10), then:

```html
<script src="https://usemezout.vercel.app/mezout.js"></script>
<button data-mezout-checkout="CHECKOUT_URL">Pay with Mezout</button>
```

Or `Mezout.open({ checkoutUrl, onPaid, onClose })`. React: `@mezout/embed-react` (not on npm yet; `packages/embed-react` in github.com/Evangel90/Mezout):

```tsx
<MezoutCheckout checkoutUrl={invoice.checkout_url} open={open} onClose={() => setOpen(false)} onPaid={() => setPaid(true)} />
```

The `mezout:paid` / `mezout:closed` browser messages are for UI only (they can be forged). Fulfil from the webhook or a server-side `GET`.

## Verify a payment: `POST /v1/verify`

```json
{ "invoice": "inv_…", "transaction": "0x…" }
```

`transaction` is optional: if the indexer hasn't seen the payment, Mezout reads that receipt and requires the router's `Paid` event for this order, merchant and amount. Also accepts the x402 facilitator form `{"x402Version": 2, "paymentPayload": …, "paymentRequirements": …}`.

- Valid: `{"object": "verification", "isValid": true, "payer", "network", "transaction", "payment", "invoice"}`
- Invalid: `{"object": "verification", "isValid": false, "invalidReason", "message", "network", "invoice"}`, `invalidReason` one of `invoice_not_paid`, `invoice_expired`, `invoice_refunded`, `requirements_mismatch`, `transaction_not_found`, `transaction_failed`, `transaction_mismatch`.
- Unknown invoice: `404`. It records nothing: accept each invoice once.

## Refunds

Mezout never holds funds. A refund is MUSD the merchant sends from the payout address to the payment's `payer`; Mezout verifies the transfer on-chain.

`POST /v1/refunds` (send an `Idempotency-Key`):

| Field | Required | |
| --- | --- | --- |
| `invoice` | yes | A paid invoice |
| `amount` | no | Defaults to everything not yet refunded or requested |
| `reason` | no | Up to 200 chars, for the merchant's records |

It returns a `pending` refund, which reserves its amount (pending + completed can't exceed the payment). The merchant sends it from the dashboard (**Payments** → **Send requested refund**) or declines it. Refund object: `id` (`re_…`), `invoice`, `payment`, `amount`, `reason`, `status` (`pending`, `completed`, `canceled`), `tx_hash`, `created_at`, `completed_at`, `canceled_at`. `POST /v1/refunds/:id/cancel` on a non-pending refund is `409`. Webhooks: `refund.completed`, `refund.canceled`.

## Errors

Body: `{"error": "<readable message>"}`.

| Status | Meaning | Do |
| --- | --- | --- |
| `400` | Bad field, unknown `starting_after`, or a refund the invoice can't take | Fix the request |
| `401` | Key missing, unknown or revoked | Check `Authorization` |
| `403` | Dashboard-session request from another site (never for API keys) | Use an API key server-side |
| `404` | No such object in this account | Check the id and key |
| `409` | Conflicting state (refund not pending) or same `Idempotency-Key` still running | Re-read, or retry shortly |
| `422` | `Idempotency-Key` reused with a different request | Use a new key |
| `429` | Rate limited | Wait `Retry-After` seconds |
| `500` | Mezout error | Retry with the same `Idempotency-Key` |

## Limits

120 requests/minute per account (all keys); 5 active API keys; 3 webhook endpoints; 10 embedded checkout sites; invoice lifetime 5 minutes to 30 days; `reference` and refund `reason` 200 chars; `success_url` 2,000 chars; idempotency keys kept 24 hours. New fields and event types can appear within `/v1`: ignore unknown ones.

## Testing

All keys are `mzk_test_`. Pay with a Mezo testnet wallet funded at https://faucet.test.mezo.org. `"expires_in": 300` makes a link expire in 5 minutes. **Send test event** on the dashboard sends a `ping` webhook.
