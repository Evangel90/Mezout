# HTTP 402 paywall: charge agents per request

`@mezout/paywall` puts an MUSD price on an API route. A request without payment gets `402 Payment Required` with a Mezout invoice in the [x402 v2](https://github.com/x402-foundation/x402/tree/main/specs) envelope; the agent pays it (gasless, through Mezout's relay) and retries with proof; the server confirms with `POST /v1/verify` and serves the request **once per invoice**. Mezo testnet only.

Install it with `npm install @mezout/paywall` (Node 20+, ESM, TypeScript types included; `viem` is its only runtime dependency, `express` an optional peer). Source: `packages/paywall` in github.com/Evangel90/Mezout. In other languages, implement the same flow over the REST API (see "Protocol" below).

## Server

Next.js (App Router), `app/api/report/route.ts`:

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

Options: `apiKey` (required, server-side only), `price` (decimal MUSD string, or a function of the request), `description`, `mimeType`, `apiUrl` (default `https://usemezout.vercel.app`), `expiresIn` (seconds, default 600), `store`, `fetch`. The handler receives `payment`: `{ invoice, transaction, payer, amount, network }`.

**More than one server instance:** the default store of used invoices is in memory. Pass a shared `store: { consume(id) }` that returns `true` only the first time for an id (Redis `SET NX`, or an insert into a unique column), or one payment could unlock a request on each instance.

## Agent client (TypeScript)

```ts
import { privateKeyToAccount } from "viem/accounts";
import { createMusdPayer, fetchWithPayment } from "@mezout/paywall/client";

const payer = createMusdPayer({
  account: privateKeyToAccount(process.env.MEZOUT_PAYER_PRIVATE_KEY as `0x${string}`),
  appUrl: "https://usemezout.vercel.app",
  maxPerPayment: "1",
  maxPerSession: "5",
});
const { response, payment } = await fetchWithPayment("https://api.example.com/report", { payer });
```

The payer signs an EIP-712 `Payment` and an exact-amount MUSD permit and posts them only to the configured Mezout `/api/relay` (never to a relay a 402 answer names). It refuses chains other than 31611, routers that aren't Mezout's, expired links, amounts that differ from the requirement, payments over either cap, and too-low balances. MCP agents get the same through the `fetch_paid_resource` tool.

## Protocol

| Step | Header (base64 JSON) | Content |
| --- | --- | --- |
| Server → agent, `402` | `PAYMENT-REQUIRED` (also the JSON body) | `{x402Version: 2, resource, accepts: [requirement]}` |
| Agent → server, retry | `PAYMENT-SIGNATURE` (`X-PAYMENT` also read) | `{x402Version, accepted, payload: {invoice, transaction, payer}}` |
| Server → agent, `200` | `PAYMENT-RESPONSE` | `{success, transaction, network, payer}` |

The single requirement:

```json
{
  "scheme": "mezout",
  "network": "eip155:31611",
  "amount": "50000000000000000",
  "asset": "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  "payTo": "<merchant payout address>",
  "maxTimeoutSeconds": 600,
  "extra": { "name": "Mezo USD", "version": "1", "invoice": "inv_…", "checkoutUrl": "https://…/pay/…", "router": "0x…", "relayUrl": "https://…/api/relay", "expiresAt": "…" }
}
```

`amount` is in wei (18 decimals). The scheme is `mezout`, not x402's `exact`: the merchant is paid only through the MezoutRouter against a signed invoice, and MUSD has EIP-2612 permits, not EIP-3009. Agents that only speak `exact` can't pay it.

Server logic without the package:

1. No payment header: `POST /v1/invoices` with the price and `reference: "402 <METHOD> <path>"` (pass through a client `Idempotency-Key`), answer `402` with the requirement built from the invoice.
2. With a payment header: decode it, `POST /v1/verify` `{invoice, transaction}`; require `isValid`, that the invoice's `reference` is this method and path and its `amount` is this price; then atomically mark the invoice used. Anything else: a fresh `402` with the reason in `error`.
