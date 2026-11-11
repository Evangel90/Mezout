# @mezout/paywall

Charge per request in MUSD over HTTP 402. Your API answers `402 Payment Required` with a Mezout invoice; an agent pays it through the MezoutRouter (gasless, via Mezout's relay) and retries with proof; your server checks the proof with `POST /v1/verify` and serves the request. Mezo testnet (31611) only.

## Wire format: x402 v2 with a `mezout` scheme

The envelope follows [x402 v2](https://github.com/x402-foundation/x402/tree/main/specs) (spec v2.0, 9 Dec 2025):

| Step | Header (base64 JSON) | Content |
| --- | --- | --- |
| Server → agent, status 402 | `PAYMENT-REQUIRED` (also the JSON body) | `PaymentRequired`: `x402Version: 2`, `resource`, `accepts: [PaymentRequirements]` |
| Agent → server, retry | `PAYMENT-SIGNATURE` (`X-PAYMENT` also read) | `PaymentPayload`: `x402Version`, `accepted`, `payload: { invoice, transaction, payer }` |
| Server → agent, status 200 | `PAYMENT-RESPONSE` | `SettlementResponse`: `success`, `transaction`, `network`, `payer` |

The single offered requirement is:

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

**Where it differs from x402, and why.** x402's `exact` EVM scheme has the client sign an EIP-3009 or Permit2 transfer straight to `payTo`, which a facilitator submits. Mezout can't use that: the merchant is paid only through the MezoutRouter, against an invoice signed by Mezout's invoice signer (exact net amount, fee and expiry enforced on-chain), and MUSD supports EIP-2612 permits, not EIP-3009. So:

- the scheme is `mezout`, not `exact`. Clients that only speak `exact` see an offer they can't take; nothing breaks.
- the agent settles first (Mezout's relay plays the facilitator's `/settle`) and sends the transaction hash as proof, instead of sending a signed authorization for the server to settle. Its signatures go only to Mezout's relay, never to the merchant's server.
- `POST /v1/verify` plays the facilitator's `/verify`. Like x402's, it is read-only, so the middleware enforces one request per invoice (see the store below). It also accepts x402's `{x402Version, paymentPayload, paymentRequirements}` body.

Google's AP2 is a layer above this (signed intent and cart mandates between agents, carried over A2A); its crypto path uses x402, so a `mezout` requirement could sit inside an AP2 payment mandate. That integration isn't built.

## Server: Express

```ts
import { mezout402 } from "@mezout/paywall/express";

app.get("/report", mezout402({ apiKey: process.env.MEZOUT_API_KEY!, price: "0.05" }), (req, res) => {
  res.json({ report, paidBy: req.mezout!.payer });
});
```

## Server: Next.js (App Router)

```ts
// app/api/report/route.ts
import { withMezout402 } from "@mezout/paywall/next";

export const GET = withMezout402({ apiKey: process.env.MEZOUT_API_KEY!, price: "0.05" }, async (req, ctx, payment) =>
  Response.json({ report, paidBy: payment.payer }),
);
```

Options: `apiKey` (required), `price` (decimal MUSD string, or a function of the request), `description`, `mimeType`, `apiUrl` (default `https://usemezout.vercel.app`), `expiresIn` (seconds, default 600), `store`, `fetch`.

How a request is checked:

1. No payment header: create an invoice (`POST /v1/invoices`, reference `402 GET /path`) and answer 402. A client `Idempotency-Key` header is passed through, so retries reuse one invoice.
2. With a payment header: `POST /v1/verify` with the invoice and transaction, then require that the invoice's reference is this method and path and its amount is this price, then mark the invoice used. Anything else gets a fresh 402 with the reason in `error`.

**One request per invoice.** The default store is in memory. With more than one server instance, pass a shared `store: { consume(id) }` that returns `true` only the first time (Redis `SET NX`, or an insert into a unique column).

## Agent client

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

The payer signs a `Payment` and an exact-amount MUSD permit with the SDK's typed data (as the checkout does) and posts them to the configured Mezout's `/api/relay`, never to a relay a 402 answer names. It refuses: chains other than 31611, routers other than Mezout's deployed ones, expired links, amounts different from the requirement, payments over either cap, and balances that are too low. The `mezout-mcp` server uses the same payer.

## Develop

In a terminal at the repository root:

```bash
pnpm --filter @mezout/paywall test       # Vitest, with a fake Mezout and chain
pnpm --filter @mezout/paywall typecheck
pnpm --filter @mezout/paywall build      # dist/ for plain Node (SDK bundled)
```
