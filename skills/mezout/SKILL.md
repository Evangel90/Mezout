---
name: mezout
description: Mezout API reference for taking and making MUSD payments on Mezo testnet (chain 31611). Use when integrating Mezout into code (creating invoices or payment links with POST /v1/invoices, checkout and embedded checkout, refunds, webhooks and Mezout-Signature verification, POST /v1/verify), adding an HTTP 402 pay-per-request paywall with @mezout/paywall, or using or setting up the Mezout MCP server (@mezout/mcp) to create, pay, check or refund invoices as an agent. Also for Mezout errors, rate limits, idempotency keys and test keys (mzk_test_).
license: MIT
metadata:
  version: "0.2.0"
  homepage: https://usemezout.vercel.app/docs
---

# Mezout

Mezout is a merchant checkout on **Mezo testnet (chain 31611)**. A merchant's server creates an invoice for an exact amount of **MUSD**; the customer (a person or an agent) pays it with MUSD, BTC or MEZO, or by borrowing MUSD against BTC; the merchant's payout address receives the amount minus the platform fee in one on-chain transaction through the `MezoutRouter` contract. Mezout never holds funds. Everything is testnet: test MUSD has no value.

## Pick the job

| Task | Read |
| --- | --- |
| Create invoices, read status, list, refund, verify, errors, limits | [references/api.md](references/api.md) |
| Receive and verify webhooks (Node, PHP, Python) | [references/webhooks.md](references/webhooks.md) |
| Charge an API per request with HTTP 402 | [references/paywall.md](references/paywall.md) |
| Use or set up the MCP server (agents paying and invoicing) | [references/mcp.md](references/mcp.md) |

Read only the file the task needs.

## Essentials

- **Base URL** `https://usemezout.vercel.app`; endpoints under `/v1`; JSON bodies.
- **Auth** `Authorization: Bearer mzk_test_…`. Keys come from the dashboard's **Developers** tab (`/dashboard`), are shown once, and must stay server-side: never in a browser, app or repository. Read them from an environment variable such as `MEZOUT_API_KEY`.
- **Amounts** are decimal strings of MUSD (up to 18 decimals), e.g. `"25.00"`. Responses use the shortest form (`"25"`): compare as decimals, never as strings.
- **IDs**: `inv_` invoice, `pay_` payment, `re_` refund, `evt_` event, `we_` webhook endpoint. Times are ISO 8601 UTC.
- **Idempotency**: send `Idempotency-Key` (e.g. your order id) on every `POST /v1/invoices` and `POST /v1/refunds`, and reuse it on retries.
- Errors are `{ "error": "<message>" }`. 120 requests a minute per account; `429` comes with `Retry-After`.

## Take a payment

```bash
curl https://usemezout.vercel.app/v1/invoices \
  -H "Authorization: Bearer $MEZOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1001" \
  -d '{"amount": "25.00", "reference": "Order 1001", "success_url": "https://shop.example.com/thanks"}'
```

`201` returns the invoice: `id`, `status: "pending"`, `amount`, `fee`, `net`, `checkout_url`, `expires_at` (default 24 h; `expires_in` 300 to 2,592,000 seconds). Send the customer to `checkout_url`, or embed it (see api.md).

**Fulfil only from a signed `invoice.paid` webhook or `GET /v1/invoices/:id` showing `status: "paid"`, and check the amount.** A visit to `success_url`, a browser `mezout:paid` message or a client's word is never proof of payment.

Statuses: `pending` (payable) → `paid` (on-chain; stays `paid` after a partial refund) or `expired` (can never be paid) ; `refunded` once completed refunds equal the amount.

## Rules that are easy to get wrong

1. Verify webhook signatures over the **raw body**, before parsing; reject timestamps more than 5 minutes off; dedupe by event `id` (delivery is at least once, order not guaranteed).
2. Refunds: Mezout can't send money. `POST /v1/refunds` creates a `pending` request that the merchant sends from the dashboard; it becomes `completed` (webhook `refund.completed`) only after the on-chain transfer is verified.
3. `POST /v1/verify` is read-only: a paywall must accept each paid invoice once (`@mezout/paywall` does).
4. There are no live keys or mainnet yet: keys start with `mzk_test_`, and the MCP server and paywall refuse other chains.
5. Agents paying invoices need a **test-only wallet**; never ask for or handle a key that holds real funds, and never print private keys or API keys.

## Testnet facts

| | |
| --- | --- |
| Chain | Mezo testnet, id `31611`, native gas token BTC |
| RPC | `https://rpc.test.mezo.org` |
| Explorer | `https://explorer.test.mezo.org` (`/tx/<hash>`) |
| Faucet (test BTC, MUSD) | `https://faucet.test.mezo.org` |
| MUSD token | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` (18 decimals) |
| MezoutRouter v3 (current) | `0x7151473F1300c2529A2eEFaA517684e974A9b3E6` |
| Docs | `https://usemezout.vercel.app/docs` |

## Agents: the MCP server

If the `mezout` MCP tools are available (`create_invoice`, `get_invoice`, `list_invoices`, `refund`, `verify_payment`, `pay_invoice`, `fetch_paid_resource`, `get_budget`), use them instead of raw HTTP. If they aren't, the user sets them up with one command: `npx -y @mezout/mcp init`. Details and limits: [references/mcp.md](references/mcp.md).
