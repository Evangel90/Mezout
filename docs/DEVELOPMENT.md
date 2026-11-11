# Developing Mezout

Run, test and deploy Mezout. Product overview: [README](../README.md). API: [`API.md`](API.md). Plugins: [`plugins/woocommerce`](../plugins/woocommerce/README.md), [`plugins/shopify`](../plugins/shopify/README.md).

## Setup

Needs Node 20+, pnpm 9 (`npm i -g pnpm@9`), Foundry (`forge`), git and PostgreSQL 14+ (`brew install postgresql@16`). In your Mac terminal, inside the `Mezout` folder:

```
git submodule update --init --recursive
pnpm install
cp .env.example .env.local
```

Create the local database and apply the migrations, inside `Mezout/apps/web`:

```
createdb mezout_dev
pnpm db:migrate
```

`DATABASE_URL` in `.env.local` must point at it, e.g. `postgres://<your Mac username>@localhost:5432/mezout_dev`. Never point it at production: Vercel's development and production environments share one Neon database, and `vercel env pull` overwrites that line, so set it back afterwards.

## Run and test

Inside `Mezout`, start the web app and open http://localhost:3000:

```
pnpm --filter @mezout/web dev
```

Tests (the app's tests use an in-memory database, not Postgres). Inside `Mezout`, then inside `Mezout/contracts` (the fork tests read Mezo testnet, so they need internet):

```
pnpm test
forge test -vv
```

## Pay an invoice from a script

With the app running, inside `Mezout/apps/web` (the payer needs test MUSD):

```
APP_URL=http://localhost:3000 ROUTER=<router address> PAYER_PRIVATE_KEY=<test key> API_KEY=<merchant's mzk_test_ key> AMOUNT=25 node scripts/pay-invoice.mjs
```

It creates the invoice with `POST /v1/invoices`, so it pays the key's merchant. To pay an existing link, pass `TOKEN=<the part of the checkout URL after /pay/>` instead of `API_KEY` and `AMOUNT`. Add `METHOD=BTC` or `METHOD=MEZO` to swap (the payer needs that token; `SLIPPAGE_BPS` sets the cap, default 1%).

## Deploy the router (Mezo testnet)

The relayer key in `.env.local` deploys and needs test BTC from faucet.test.mezo.org. Inside `Mezout/contracts`:

```
set -a; source ../.env.local; set +a
forge script script/Deploy.s.sol --rpc-url mezo_testnet --private-key $RELAYER_PRIVATE_KEY --broadcast \
  --verify --verifier sourcify
```

Put the printed address in `.env.local` as `NEXT_PUBLIC_ROUTER_ADDRESS`. To switch production, first [apply migrations](#apply-migrations-to-production), then replace the Vercel variable and redeploy, inside `Mezout`:

```
pnpm dlx vercel env rm NEXT_PUBLIC_ROUTER_ADDRESS production --yes
pnpm dlx vercel env add NEXT_PUBLIC_ROUTER_ADDRESS production
pnpm dlx vercel deploy --prod --yes
```

The relayer calls only the current router and the earlier ones listed in `packages/sdk/src/addresses.ts` (`mezoutRouterV1`, `mezoutRouterV2`); links signed for any other router stop working after a switch.

## Seed the MUSD/MEZO pool (Mezo testnet)

Tigris had no MUSD/MEZO pool, so Mezout creates one; the first deposit sets the price. The funding key (`TEST_PAYER_PRIVATE_KEY`, or `SEED_PRIVATE_KEY` if set) needs the MUSD, MEZO from the faucet and a little test BTC for gas. Inside `Mezout/contracts`:

```
MUSD_AMOUNT=250 MEZO_AMOUNT=1000 ./script/seed-mezo-pool.sh
```

## Deploy the web app (Vercel)

Pushing to `main` deploys production through Vercel's Git integration. For a deploy from local changes, run this inside `Mezout` itself, not `apps/web` (the Vercel project link lives at the repo root; from `apps/web` the CLI creates a new, empty project):

```
pnpm dlx vercel deploy --prod --yes
```

Production needs these secrets (each command asks for the value):

```
pnpm dlx vercel env add WEBHOOK_SIGNING_SECRET production
pnpm dlx vercel env add CRON_SECRET production
gh secret set CRON_SECRET
pnpm dlx vercel env add ALERT_WEBHOOK_URL production         # optional, Discord or Slack incoming webhook
pnpm dlx vercel env add RELAYER_MIN_BALANCE_BTC production   # optional, default 0.0001
```

Each webhook endpoint's secret is derived from `WEBHOOK_SIGNING_SECRET`, so changing it changes every endpoint's secret.

## Apply migrations to production

Production uses a Neon database added through the Vercel integration. Inside `Mezout`:

```
pnpm --dir apps/web db:migrate:prod
```

This uses `DATABASE_URL_UNPOOLED` (Neon's direct URL) from `.env.local` instead of `DATABASE_URL`.

## Indexer, scheduler, alerts and status

**Indexer.** `/api/cron` (protected by `CRON_SECRET`) reads `Paid` events, expires invoices and retries webhooks. The checkout also asks for a sync when a payment lands, and reading an unpaid invoice syncs if the index is stale, so invoices usually show paid within seconds. The first run backfills from router v1's deploy block. To run it once against the local app, inside `Mezout`:

```
set -a; source .env.local; set +a
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

**Scheduler.** Vercel's Hobby plan only allows daily crons and GitHub Actions' 5-minute schedule runs hours apart in practice, so an external cron-job.org job calls `https://usemezout.vercel.app/api/cron` every 5 minutes (GET, header `Authorization: Bearer <CRON_SECRET>`, 60-second timeout, failure notifications on). `.github/workflows/indexer.yml` stays as a backstop.

**Alerts.** Each run checks the relayer's gas balance (below `RELAYER_MIN_BALANCE_BTC`) and webhook deliveries that ran out of retries, and reports a failed run. Alerts go to `ALERT_WEBHOOK_URL` at most once per alert per window (6 hours for low balance, 1 hour otherwise); without it they are only logged.

**Status.** `/api/health` is public. It answers 503 with `status: "degraded"` and a list of `problems` when the relayer balance is low or the indexer hasn't run for 15 minutes (which catches a scheduler that stopped). Watch it with an uptime monitor every 5 minutes.
