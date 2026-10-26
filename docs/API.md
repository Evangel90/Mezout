# Mezout API

Mezout is a checkout for Mezo. Your server creates an invoice for an exact amount of MUSD, the customer pays it in MUSD, BTC or MEZO, or by borrowing MUSD against their BTC, and your payout address receives exactly the invoiced amount. Mezout never holds funds: payments go from the customer to you through the `MezoutRouter` contract in one transaction.

> **Testnet.** Mezout runs on Mezo testnet (chain 31611). Every amount is test MUSD with no value. Keys start with `mzk_test_`.

## Overview

A payment goes like this:

1. **Your server creates an invoice** with `POST /v1/invoices`, giving the amount and your own order number.
2. **You send the customer to the invoice's `checkout_url`.** They pick how to pay and confirm in their wallet.
3. **The router pays you.** One transaction moves the exact amount to your payout address and records the invoice's `order_id` in a `Paid` event on Mezo.
4. **Mezout tells your server.** It reads the `Paid` event and sends an `invoice.paid` webhook to your endpoint.
5. **Your server fulfils the order.** It marks the order paid, ships it, or grants access.

Webhooks are how your store learns that it has been paid, without anyone watching the dashboard. Polling `GET /v1/invoices/:id` also works, and is a good fallback if your server was down.

### Words used here

| Term | Meaning |
| --- | --- |
| Payout address | The address that receives your payments: your Mezout passkey account, or the wallet you signed in with. |
| Invoice | A request for an exact MUSD amount, with a checkout link that expires. |
| Payment | The on-chain payment of an invoice, read from the router's `Paid` event. |
| Refund | MUSD you send back to the customer from your payout address. |
| Event | Something that happened (an invoice was paid, say), delivered to your webhook endpoints. |

## Quickstart

This takes about five minutes. You need a terminal with `curl`.

**1. Get an API key.** Open [the dashboard](/dashboard), choose a passkey account or sign in with a wallet, and set your business name. On the **Developers** tab, click **Create API key** and copy the key.

**2. Create an invoice.** In a terminal on your computer, in any folder (replace the key):

```bash
curl https://usemezout.vercel.app/v1/invoices \
  -H "Authorization: Bearer mzk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1001" \
  -d '{"amount": "25.00", "reference": "Order 1001"}'
```

**3. Open the `checkout_url`** from the response in a browser and pay with a Mezo testnet wallet. The page shows **Payment complete** once the payment is on-chain.

**4. Check the invoice.** In the same terminal, with the `id` from step 2:

```bash
curl https://usemezout.vercel.app/v1/invoices/inv_YOUR_INVOICE_ID \
  -H "Authorization: Bearer mzk_test_YOUR_KEY"
```

`status` is now `paid` and `payment` describes the transaction.

**5. Receive webhooks.** Follow [Receive your first webhook](#receive-your-first-webhook) to run a receiver and get `invoice.paid` the moment a customer pays.

## Authentication

Send your API key as a bearer token on every request:

```
Authorization: Bearer mzk_test_…
```

- **Keep keys on your server.** Anyone with a key can create invoices and request refunds for your account. Never put one in a browser, mobile app or public repository.
- **Keys pay you.** Every invoice created with a key pays that account's payout address. A request cannot change it.
- **Keys are shown once.** Mezout stores only a SHA-256 hash, so a lost key cannot be recovered. Create a new one instead.
- **Manage keys** on the dashboard's **Developers** tab. An account can hold up to 5 active keys. **Revoke** stops a key at once: requests with it get `401`.

To rotate a key: create a new one, deploy it to your server, then revoke the old one.

## Requests and responses

- **Base URL:** `https://usemezout.vercel.app`. Every endpoint is under `/v1`.
- **Bodies** are JSON. Send `Content-Type: application/json`.
- **Amounts** are decimal strings of MUSD, such as `"25.00"` or `"0.5"`, with up to 18 decimal places. Responses use the shortest form, so `"25.00"` comes back as `"25"`. Compare amounts as decimals, not as strings.
- **Times** are ISO 8601 in UTC, such as `"2026-10-24T16:27:37.000Z"`.
- **IDs** have a prefix showing their type: `inv_` invoice, `pay_` payment, `re_` refund, `evt_` event, `we_` webhook endpoint.
- **New fields** can be added to any object without notice. Ignore fields you don't use.

## Errors

Errors return a JSON body with a readable message:

```json
{ "error": "amount: amount must be a decimal string, e.g. \"25.00\"" }
```

| Status | Meaning | What to do |
| --- | --- | --- |
| `400` | The request is invalid: a bad field, `starting_after` that is not one of your invoices, or a refund the invoice cannot take. | Fix the request. Retrying unchanged fails again. |
| `401` | The API key is missing, unknown or revoked. | Check the `Authorization` header. |
| `404` | No invoice, refund or endpoint with that id belongs to your account. | Check the id and which key you used. |
| `409` | The request conflicts with the current state: a refund that is no longer pending, or a request with the same `Idempotency-Key` that is still running. | Read the object again, or retry shortly. |
| `422` | The `Idempotency-Key` was already used with a different request. | Use a new key for a new request. |
| `429` | Too many requests. | Wait for the number of seconds in the `Retry-After` header. |
| `500` | Something went wrong on Mezout's side. | Retry with the same `Idempotency-Key`. |

## Rate limits

Each account can make **120 requests a minute** to `/v1`, counted across all its keys. Over the limit, Mezout answers `429` with a `Retry-After` header giving the seconds until the next minute starts.

## Idempotency

A network error can leave you unsure whether a request worked. Send an `Idempotency-Key` header with `POST /v1/invoices` and `POST /v1/refunds`, and retrying is safe: the request runs once, and every retry with the same key gets the first response back, with the header `Idempotent-Replayed: true`.

```bash
curl https://usemezout.vercel.app/v1/invoices \
  -H "Authorization: Bearer mzk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1001" \
  -d '{"amount": "25.00", "reference": "Order 1001"}'
```

- Use a value that identifies the operation, such as your order number, or a random UUID. Keys are 1 to 255 printable ASCII characters, and are separate for each account.
- Mezout keeps each key for **24 hours**.
- Reusing a key with a different body or endpoint returns `422`. While the first request is still running, a retry returns `409`.
- `400`-range answers are stored and replayed like successes. A `500` is not stored, so a retry runs the request again.

## Pagination

`GET /v1/invoices` returns a list, newest first:

```json
{ "object": "list", "data": [ { "id": "inv_…", "object": "invoice" } ], "has_more": true }
```

`limit` sets the page size, from 1 to 100 (default 20). When `has_more` is `true`, pass the last `id` as `starting_after` to get the next page.

```bash
curl "https://usemezout.vercel.app/v1/invoices?limit=50&starting_after=inv_3bf9a158b706b1412e77528f" \
  -H "Authorization: Bearer mzk_test_YOUR_KEY"
```

## Invoices

### The invoice object

```json
{
  "id": "inv_3bf9a158b706b1412e77528f",
  "object": "invoice",
  "order_id": "0x4f3d7953e110470549275f6172dff8cca526384ed77d0a98a07083d21b821623",
  "merchant": "0x7049Fcb3a331481a1EE860eb041cf0F9A133E264",
  "amount": "25",
  "fee": "0",
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
| `id` | The invoice's id. |
| `order_id` | The id the router records on-chain when the invoice is paid. It appears in the `Paid` event. |
| `merchant` | Your payout address, which the payment goes to. |
| `amount` | The amount the customer pays, in MUSD. |
| `fee` | Mezout's fee, taken from `amount`. Always `"0"` on testnet. |
| `reference` | Your own order number or note, or `null`. **The customer sees it at checkout.** |
| `status` | `pending`, `paid`, `expired` or `refunded`. See [Invoice status](#invoice-status). |
| `amount_refunded` | MUSD refunded so far, counting completed refunds only. |
| `payment` | The [payment](#the-payment-object) once the invoice is paid, otherwise `null`. |
| `checkout_url` | Where to send the customer to pay. |
| `success_url` | Where the checkout sends the customer after paying, or `null`. |
| `expires_at` | After this time the link can no longer be paid. |

### Create an invoice

`POST /v1/invoices`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `amount` | string | Yes | MUSD to charge, as a decimal string greater than 0, such as `"25.00"`. |
| `currency` | string | No | Only `"MUSD"`. |
| `reference` | string | No | Your order number, up to 200 characters. Shown to the customer and returned as is. |
| `success_url` | string | No | Where to send the customer after they pay, up to 2,000 characters. Must be `https` (`http` only for `localhost`). |
| `expires_in` | integer | No | Seconds until the link expires, from 300 (5 minutes) to 2,592,000 (30 days). Default 86,400 (24 hours). |

Returns `201` with the invoice. Send an `Idempotency-Key` so a retry cannot create a second invoice.

### Retrieve an invoice

`GET /v1/invoices/:id`

Returns the invoice with its current status. If the indexer has not caught up, Mezout reads Mezo testnet first, so a payment confirmed seconds ago already shows as `paid`.

### List invoices

`GET /v1/invoices?limit=20&starting_after=inv_…`

Returns your invoices, newest first. See [Pagination](#pagination).

### Invoice status

| Status | Meaning |
| --- | --- |
| `pending` | Not paid, and the link can still be paid. |
| `paid` | The payment is on-chain and the MUSD is in your payout address. |
| `expired` | Not paid, and `expires_at` has passed. The router rejects payment, so it can never become paid. |
| `refunded` | Paid, and completed refunds add up to the full amount. |

`pending` can become `paid` or `expired`. `paid` becomes `refunded` once completed refunds add up to the full amount. A partly refunded invoice stays `paid`, and `amount_refunded` shows how much has gone back.

The router accepts payment up to and including the second of `expires_at`. The API reports `expired` from the next second. The `invoice.expired` webhook waits until Mezo's chain time has passed `expires_at`, so it can arrive a few minutes after the API first says `expired`.

### Checkout and the success URL

`checkout_url` opens a page showing your business name, the amount, `reference` and how long the link is valid. The customer picks MUSD, BTC, MEZO or borrowing against BTC; whichever they choose, you receive `amount` in MUSD.

After the payment confirms, the page shows **Payment complete**. If you set `success_url`, it also shows a **Return to (your business name)** button that opens that URL. Put your own order number in it, for example `https://shop.example.com/orders/1001/thanks`.

> **Don't treat a visit to `success_url` as proof of payment.** Anyone can open a URL. Fulfil the order from the `invoice.paid` webhook, or after checking `GET /v1/invoices/:id`.

## Payments

### The payment object

An invoice's `payment` describes the on-chain payment:

```json
{
  "id": "pay_…",
  "object": "payment",
  "order_id": "0x4f3d…1623",
  "payer": "0x5a1c…77e0",
  "method": "MEZO",
  "amount": "25",
  "fee": "0",
  "net": "25",
  "asset_in": "0x7B7c000000000000000000000000000000000001",
  "amount_in": "25.18",
  "borrowed": "0",
  "router": "0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431",
  "tx_hash": "0x…",
  "block_number": 16400000,
  "paid_at": "2026-10-24T16:31:02.000Z"
}
```

| Field | Description |
| --- | --- |
| `payer` | The address that paid. Refunds go back to it. |
| `method` | `MUSD`, `BTC`, `MEZO` or `BORROW`. |
| `amount` | The invoice amount paid. |
| `fee` | Mezout's fee. |
| `net` | What reached your payout address: `amount` minus `fee`. |
| `asset_in`, `amount_in` | The token and amount the customer spent. For `BTC` and `MEZO` this includes the swap on Tigris. |
| `borrowed` | For `BORROW`, the MUSD the customer drew from their Mezo trove. `"0"` otherwise. |
| `router` | The `MezoutRouter` contract that took the payment. |
| `tx_hash`, `block_number` | Where to find the payment on the [Mezo testnet explorer](https://explorer.test.mezo.org). |
| `paid_at` | The block's time. |

## Refunds

Mezout never holds your funds, so it cannot send a refund for you. A refund is MUSD you send from your payout address back to the customer's `payer` address. Mezout checks the transfer on-chain and records it.

There are two ways to refund:

- **From the dashboard.** On the **Payments** tab, click **Refund** on an order and confirm the transfer. The refund completes as soon as the transfer is checked.
- **Request from your server, send from the dashboard.** Your store calls `POST /v1/refunds`, for example when a customer cancels. The refund is `pending` until you open the order on the **Payments** tab and click **Send requested refund**, or **Decline request** to cancel it.

When a refund completes, Mezout sends `refund.completed`. When a request is canceled or declined, it sends `refund.canceled`, so a store that recorded the refund can undo it.

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
| `pending` | Requested, waiting for you to send it from the dashboard. Its amount is set aside, so other refunds cannot exceed the payment. |
| `completed` | The transfer is on-chain. `tx_hash` is the transaction. |
| `canceled` | The request was canceled. Nothing was sent. |

Mezout marks a refund `completed` only if its transaction succeeded, was mined after the payment, moved MUSD from your payout address to the payer, and is not already recorded as another refund. When you send a pending refund, the transfer must be for exactly its amount.

### Create a refund

`POST /v1/refunds`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `invoice` | string | Yes | The id of a paid invoice. |
| `amount` | string | No | MUSD to refund. Defaults to everything not yet refunded or requested. |
| `reason` | string | No | A note for your records, up to 200 characters. |

Returns `201` with a `pending` refund. Pending and completed refunds together cannot exceed what the customer paid. Send an `Idempotency-Key` so a retry cannot request the refund twice.

### Retrieve a refund

`GET /v1/refunds/:id`

### Cancel a refund

`POST /v1/refunds/:id/cancel`

Cancels a `pending` refund and frees its amount. Returns the refund with status `canceled`, and sends `refund.canceled`. A refund that is already `completed` or `canceled` returns `409`.

## Webhooks

A webhook is a URL on your server that Mezout calls when something happens. When a customer pays, Mezout sends `invoice.paid` there, and your server marks the order paid and fulfils it. This is how a store finds out it has been paid without anyone watching the dashboard.

### Receive your first webhook

The repository includes a small receiver, [`examples/webhook-receiver/server.mjs`](https://github.com/Evangel90/Mezout/blob/main/examples/webhook-receiver/server.mjs), with no dependencies. It checks signatures, ignores duplicates and logs what it would fulfil.

1. **Add an endpoint.** Mezout delivers only to public `https` URLs. To try the receiver on your computer, give it a public URL with a tunnel, such as [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/). In a second terminal, in any folder:

   ```bash
   cloudflared tunnel --url http://localhost:4242
   ```

   It prints a URL such as `https://random-words.trycloudflare.com`. On the dashboard's **Developers** tab, under **Webhooks**, add that URL followed by `/webhooks/mezout`. Copy the signing secret (`whsec_…`) it shows.

2. **Start the receiver.** In a terminal, in the `examples/webhook-receiver` folder of the Mezout repository (replace the secret):

   ```bash
   MEZOUT_WEBHOOK_SECRET=whsec_YOUR_SECRET node server.mjs
   ```

3. **Send a test event.** On the **Developers** tab, click **Send test event**. The receiver logs `test event from the dashboard`, and the endpoint's **Delivery log** shows `200`.

4. **Pay an invoice.** Create an invoice and pay it as in the [Quickstart](#quickstart). The receiver logs `fulfil Order 1001: 25 MUSD paid by 0x…`.

### Events

| Type | Sent when | `data.object` |
| --- | --- | --- |
| `invoice.paid` | An invoice's payment is on-chain. | The invoice, with `payment`. |
| `invoice.expired` | An invoice was not paid before `expires_at` (in Mezo's chain time). | The invoice. |
| `refund.completed` | A refund's transfer is checked on-chain. | The refund, with `invoice` as the full invoice object. |
| `refund.canceled` | A pending refund is canceled, by the API or **Decline request** on the dashboard. | The refund, with `invoice` as the full invoice object. |
| `ping` | You click **Send test event** on the dashboard. | `{"object": "ping", …}` |

Each event is sent to every endpoint you had when it happened. New event types may be added, so ignore types you don't handle.

### The event object

Mezout POSTs the event as JSON:

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
      "payment": { "id": "pay_…", "payer": "0x5a1c…77e0", "net": "25", "tx_hash": "0x…" }
    }
  }
}
```

`data.object` is a snapshot from when the event happened. It is not updated later, and retries send the same body. For the current state, call `GET /v1/invoices/:id`.

The request carries these headers:

| Header | Value |
| --- | --- |
| `Mezout-Signature` | `t=<unix seconds>,v1=<hex signature>`. See [Verify signatures](#verify-signatures). |
| `Mezout-Event-Id` | The event's `id`. |
| `Mezout-Event-Type` | The event's `type`. |
| `Content-Type` | `application/json` |
| `User-Agent` | `Mezout-Webhooks/1` |

### Handle events

Your endpoint should:

1. **Verify the signature** against the raw body, before parsing it. Answer `400` if it fails.
2. **Ignore duplicates.** Store each event `id` you have processed, and answer `200` without doing anything if you see it again.
3. **Check the details.** For `invoice.paid`, find your order by `data.object.id` or `reference`, and check that `amount` is what you charged.
4. **Answer `2xx` within 10 seconds.** If fulfilment is slow, save the event, answer `200`, and do the work afterwards.

Any other answer, a timeout or a connection error counts as a failure, and Mezout tries again later.

### Delivery and retries

- **At least once.** Mezout keeps trying until your endpoint answers `2xx`, so the same event can arrive more than once, for example if your server timed out after processing it. Use the event `id` to ignore duplicates.
- **Timing.** Mezout reads Mezo testnet about every 5 minutes, and straight away when a customer pays through the checkout page. So `invoice.paid` usually arrives within seconds, and otherwise within a few minutes. `invoice.expired` can arrive several minutes after `expires_at`.
- **Retries.** After a failure, Mezout waits about 1 minute, then 2, 4, 8 and so on, never more than 6 hours between tries, until 24 hours after the event. Retries go out on the next 5-minute check after they are due. After 24 hours the delivery is marked failed.
- **Retry by hand.** Each endpoint's **Delivery log** on the dashboard shows every attempt, with the status code and the start of your response. **Retry now** sends a failed delivery again.
- **Order is not guaranteed.** A retried `invoice.paid` can arrive after a later `refund.completed`. Use each object's `status` and timestamps, not arrival order.
- **No backfill.** A new endpoint gets only events that happen after it is added. To catch up after downtime, list invoices with `GET /v1/invoices`.

### Verify signatures

Every request is signed with the endpoint's signing secret, so you can check that it came from Mezout and was not changed. `v1` is the hex HMAC-SHA256 of the string `<t>.<raw body>`, keyed with the secret.

To verify:

1. Split `Mezout-Signature` on `,` and `=` to get `t` and `v1`.
2. Compute the HMAC-SHA256 of `t`, a `.`, and the **raw request body exactly as received**. Parsing and re-serialising the JSON changes the bytes and breaks the signature.
3. Compare your result with `v1` using a constant-time comparison.
4. Reject the request if `t` is more than 5 minutes from your clock, so a captured request cannot be replayed later.

In Node.js (from the example receiver):

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

In PHP:

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

In Python:

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

Each endpoint has its own secret, starting `whsec_`. The dashboard shows it when you add the endpoint, and **Show secret** shows it again later. Keep it on your server, like an API key. If a secret leaks, delete the endpoint and add it again: the new endpoint gets a new secret.

## Webhook endpoints

You can manage endpoints on the dashboard or with the API. An account can have up to 3 endpoints.

### The webhook endpoint object

```json
{
  "id": "we_8f1e2d3c4b5a69788796a5b4",
  "object": "webhook_endpoint",
  "url": "https://shop.example.com/webhooks/mezout",
  "secret": "whsec_…",
  "created_at": "2026-10-24T16:00:00.000Z"
}
```

`secret` is included only in the response that creates the endpoint.

### Create an endpoint

`POST /v1/webhook_endpoints` with `{"url": "https://…"}`

The URL must use `https`, must not contain a username or password, and its host must resolve to public internet addresses only. Mezout checks this when you add the endpoint and again on every delivery. Returns `201` with the endpoint and its `secret`.

### List endpoints

`GET /v1/webhook_endpoints`

### Delete an endpoint

`DELETE /v1/webhook_endpoints/:id`

Stops deliveries straight away. Deliveries still queued for it are marked failed.

## Testing

- **Everything is on testnet.** Make as many invoices as you like and pay them with a Mezo testnet wallet. Nothing has real value.
- **Test your endpoint** with **Send test event** on the dashboard, which sends a `ping`.
- **Test expiry** with `"expires_in": 300`. The link stops working after 5 minutes, and `invoice.expired` follows within a few more.
- **Test refunds** by refunding a paid test invoice from the **Payments** tab.

## Versioning

The API is versioned in the path: `/v1`. Within `v1`, Mezout may add endpoints, optional parameters, fields and event types without notice, so write code that ignores what it does not know. Changes that could break existing code, such as removing or renaming a field, will come in a new version. Changes are listed in the [changelog](https://github.com/Evangel90/Mezout/blob/main/CHANGELOG.md).

## Limits

| Limit | Value |
| --- | --- |
| Requests | 120 a minute per account |
| API keys | 5 active per account |
| Webhook endpoints | 3 per account |
| Invoice lifetime | 5 minutes to 30 days (default 24 hours) |
| `reference`, refund `reason` | 200 characters |
| `success_url` | 2,000 characters |
| Webhook response time | 10 seconds |
| Webhook retries | Up to 24 hours after the event |
| Idempotency keys | Kept 24 hours |
