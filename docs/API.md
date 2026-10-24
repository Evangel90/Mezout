# Mezout merchant API (testnet)

Base URL: `https://usemezout.vercel.app` (or `http://localhost:3000` when running locally). Everything is on Mezo testnet; amounts are test MUSD.

## Get an API key

1. Open `/dashboard` and connect the wallet that should receive MUSD. Its address becomes your payout address.
2. Click **Create API key** and sign the message. Signing costs no gas.
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
| `paid` | `MezoutRouter.paid(order_id)` is true on Mezo testnet. The MUSD is in the payout address. |
| `expired` | Not paid and past `expires_at`. The router will reject payment. |

Status is read from the chain on each request. Webhooks replace polling in Milestone 3.

## Errors

Errors return JSON `{"error": "<message>"}`.

| Code | When |
| --- | --- |
| 400 | Invalid body, e.g. a non-decimal amount or `expires_in` out of range. |
| 401 | Missing, unknown or revoked API key. |
| 404 | No invoice with that id belongs to your key's payout address. |
| 429 | More than 120 requests per minute for one merchant. |
| 503 | Mezo testnet could not be read. Retry. |

## Key issuance (used by the dashboard)

`POST /api/keys` with `{"address", "issuedAt", "signature"}`, where `signature` signs this exact text (EIP-191 `personal_sign`):

```
Mezout: create an API key
Payout address: <checksummed address>
Issued at: <issuedAt, ISO 8601 UTC with milliseconds>
Network: Mezo testnet (31611)
```

The request must be under 5 minutes old and each signed message can create one key. Smart-account signatures (ERC-1271 and ERC-6492, used by Bitcoin wallets in Mezo Passport) are accepted. `keyRequestMessage` in `@mezout/sdk` builds the text.

For a Mezout passkey account, `signature` is a WebAuthn assertion whose challenge is the message's EIP-191 hash (`hashMessage`), encoded with `encodeWebAuthnSignature` from `@mezout/sdk`. The server checks it against the passkey's registered public key, this site's domain and origin, and user verification.
