# Mezout webhooks

Mezout POSTs a JSON event to each of the merchant's endpoints (up to 3, public `https` only, no credentials in the URL). Add one on the dashboard's **Developers** tab or with `POST /v1/webhook_endpoints`; each has its own signing secret `whsec_…` (keep it server-side, e.g. `MEZOUT_WEBHOOK_SECRET`).

## Events

| `type` | Sent when | `data.object` |
| --- | --- | --- |
| `invoice.paid` | The invoice's payment is on-chain | The invoice, with `payment` |
| `invoice.expired` | Not paid before `expires_at` (Mezo chain time; can be minutes late) | The invoice |
| `refund.completed` | A refund's transfer is verified on-chain | The refund, with `invoice` as the full invoice |
| `refund.canceled` | A pending refund was canceled (API) or declined (dashboard) | The refund, with `invoice` as the full invoice |
| `ping` | **Send test event** on the dashboard | `{"object": "ping", …}` |

Ignore types you don't handle; new ones may be added.

```json
{
  "id": "evt_5c0b7e1a9f3d42e6b8a1c7d2",
  "object": "event",
  "type": "invoice.paid",
  "created_at": "2026-10-24T16:31:04.120Z",
  "data": { "object": { "id": "inv_…", "object": "invoice", "status": "paid", "amount": "25", "reference": "Order 1001", "payment": { "id": "pay_…", "payer": "0x…", "net": "24.75", "tx_hash": "0x…" } } }
}
```

`data.object` is a snapshot from when the event happened (retries resend the same body). For current state call `GET /v1/invoices/:id`.

Headers: `Mezout-Signature: t=<unix seconds>,v1=<hex>`, `Mezout-Event-Id`, `Mezout-Event-Type`, `Content-Type: application/json`, `User-Agent: Mezout-Webhooks/1`.

## Handler checklist

1. Read the **raw body** (don't let a framework parse and re-serialise it first).
2. Verify `Mezout-Signature`; answer `400` if it fails.
3. Dedupe by event `id`: if seen, answer `200` and stop.
4. For `invoice.paid`: find the order by `data.object.id` (store the invoice id when you create it) or `reference`, check `amount` equals what you charged (compare as decimals), then fulfil.
5. Answer `2xx` within 10 seconds; for slow work, store the event, answer `200`, process later.

Delivery is **at least once** and **unordered**: rely on each object's `status` and timestamps. Failed deliveries (non-`2xx`, timeout, connection error) are retried after about 1, 2, 4, 8… minutes (at most 6 hours apart) until 24 hours after the event, then marked failed. The dashboard's **Delivery log** shows attempts and has **Retry now**. A new endpoint gets no backfill: list invoices to catch up after downtime.

## Verify the signature

`v1` = hex HMAC-SHA256 of `` `${t}.${rawBody}` `` keyed with the endpoint secret. Compare in constant time; reject `t` more than 300 seconds from now.

Node.js:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMezoutSignature(rawBody, header, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const parts = Object.fromEntries(String(header ?? "").split(",").map((p) => p.split("=", 2)));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || typeof parts.v1 !== "string") return false;
  if (Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return parts.v1.length === expected.length && timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}
```

Express: mount the route with `express.raw({ type: "application/json" })` and pass `req.body.toString("utf8")`. Next.js App Router: `const raw = await req.text()`, then `JSON.parse(raw)` only after verifying.

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

A complete dependency-free receiver: `examples/webhook-receiver/server.mjs` in github.com/Evangel90/Mezout. To test locally, expose it with a tunnel (`cloudflared tunnel --url http://localhost:4242`), add `<tunnel URL>/webhooks/mezout` as an endpoint, and click **Send test event**.

If a secret leaks, delete the endpoint and add it again to get a new one.
