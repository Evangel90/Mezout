# Changelog

## Unreleased

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
