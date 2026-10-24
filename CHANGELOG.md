# Changelog

## Unreleased

- M1: minimal merchant API: wallet-signed API key issuance (`/api/keys`, dashboard panel), `POST /v1/invoices` and `GET /v1/invoices/:id` with on-chain status; Postgres via Drizzle with migrations; reference in `docs/API.md`.
- M1: `MezoutRouter` with `payWithMUSD` and `payWithBorrow`, merchant-paid signed fee, payer `Payment` signatures for relayed calls, 160% borrow floor.
- M1: hosted checkout `/pay/<link>` with Mezo Passport, relayer API, invoice API and payment-link dashboard with QR.
- M1: SDK typed data pinned to router hash vectors; borrow quotes and trove hints.
- M0: monorepo scaffold (Foundry contracts, Next.js 14 web app, TypeScript SDK), build brief in `docs/BRIEF.md`.
