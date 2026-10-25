# Changelog

## Unreleased

- API reference on the website at `/docs`, rendered from `docs/API.md` at build time with an "On this page" index and GitHub-matching anchors; linked from the header, the landing page and the Developers tab.

- Dashboard redesign: sign-in is one clear choice between a passkey account and a Mezo wallet, each a separate merchant account; creating or choosing a passkey signs in straight away, and a remembered passkey signs back in with one tap. Signed in, the dashboard has Overview, Payments, Developers and Account tabs, with an account chip showing which method is in use. Payment links show a full-size QR code with Copy and Open buttons. Landing page updated for BTC and MEZO payments, webhooks and router v2.

- M3: indexer (`apps/web/src/lib/server/indexer.ts`) reads `Paid` events from both routers in chunks of up to 10,000 blocks, one block behind the head, with backfill from v1's deploy block. Invoices become paid only from indexed events. Runs from `/api/cron` (every 5 minutes through `.github/workflows/indexer.yml`), after each checkout payment (`/api/sync`), and when an unpaid invoice is read while the index is stale. New status `refunded`; invoices gain `amount_refunded` and `payment`. Migration `0003`.
- M3: signed webhooks: `invoice.paid`, `invoice.expired`, `refund.completed` and `ping`, HMAC-SHA256 `Mezout-Signature` header, retries with backoff for 24 hours, a delivery log with Retry now, up to 3 endpoints per merchant (`/v1/webhook_endpoints`). Deliveries go only to public https addresses, checked after DNS resolution and without following redirects.
- M3: refunds: `POST /v1/refunds` requests one; the dashboard sends MUSD from the payout address to the customer and Mezout verifies the transfer on-chain before marking it completed.
- M3: dashboard sign-in (signed message or passkey, 12-hour HttpOnly session); orders list with CSV export and refunds; webhooks panel; API keys minted from the session; `GET /v1/invoices` lists invoices.
- M3: `scripts/pay-invoice.mjs` creates invoices with `API_KEY` instead of `MERCHANT`; `/api/invoices` (dashboard links) needs a session.

- M2: `payWithMEZO` and `payWithBTC`: exact-output swaps on Tigris volatile pools. The router computes the least input from the pool's reserves at execution and pulls only that from the payer into the pool, so nothing needs refunding; the payer's `SwapPayment` signature binds the token, a slippage cap and a deadline. Both are gasless through BTC and MEZO permits. Router v2 deployed and verified on Sourcify; v1 still pays older links.
- M2: checkout offers Pay with BTC and Pay with MEZO with live quotes, and shows only options the connected wallet can use; Bitcoin-wallet smart accounts approve and pay directly.
- M2: payment links and invoices record their router (migration `0002`); the relayer only calls the current router or v1.
- M2: MUSD/MEZO Tigris pool created on testnet (`0x8eb88d745B0aFFF9D71AbC40d7F550Cded7bB342`, 80 MUSD + 80 MEZO); first MEZO payment `0x3c7ea6fb940eb06f93c1d276129ab94a7dec6d625efa10422918722a0cb8126a`.
- M2: production switched to router v2 (migration `0002` applied to Neon); first production MEZO payment `0x7185c981d0a3d13f182b607a4a8e322accdf1fa4b59d55cf7050c95b94b256ce`. `pnpm db:migrate:prod` migrates production through `DATABASE_URL_UNPOOLED`.
- M2: `contracts/script/seed-mezo-pool.sh` creates and funds the MUSD/MEZO Tigris pool; `scripts/pay-invoice.mjs` gains `METHOD=BTC|MEZO`.

- Landing page rewritten for judges and merchants (passkey sign-up, gasless payments, API, verified contracts); wallet providers now load only on `/dashboard` and `/pay`, so the landing page is server-rendered.
- Contracts verified on Sourcify (exact match); the Mezo explorer cannot verify Cancun builds.
- Canonical domain is now `usemezout.vercel.app`; `mezout-snowy.vercel.app` redirects there (308), since passkeys are bound to one domain.
- M1: walletless merchants: `MezoutAccount` (OpenZeppelin ERC-4337 account with a passkey/WebAuthn signer, EntryPoint v0.7) and `MezoutAccountFactory` deployed to testnet; passkey sign-up, sign-in, API keys and relayer-sponsored MUSD withdrawals in the dashboard.
- M1: minimal merchant API: wallet-signed API key issuance (`/api/keys`, dashboard panel), `POST /v1/invoices` and `GET /v1/invoices/:id` with on-chain status; Postgres via Drizzle with migrations; reference in `docs/API.md`.
- M1: `MezoutRouter` with `payWithMUSD` and `payWithBorrow`, merchant-paid signed fee, payer `Payment` signatures for relayed calls, 160% borrow floor.
- M1: hosted checkout `/pay/<link>` with Mezo Passport, relayer API, invoice API and payment-link dashboard with QR.
- M1: SDK typed data pinned to router hash vectors; borrow quotes and trove hints.
- M0: monorepo scaffold (Foundry contracts, Next.js 14 web app, TypeScript SDK), build brief in `docs/BRIEF.md`.
