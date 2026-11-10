# Developing Mezout

How to run, test and deploy Mezout. For what it does and how it works, see the [README](../README.md); for the API, [`API.md`](API.md); for the WooCommerce plugin, [`plugins/woocommerce/README.md`](../plugins/woocommerce/README.md).

## Prerequisites

Node 20+, pnpm 9 (`npm i -g pnpm@9`), Foundry (`forge`), git, and PostgreSQL 14+ for the merchant API (`brew install postgresql@16`).

## Setup

In your Mac terminal, inside the `Mezout` folder:

```
git submodule update --init --recursive
pnpm install
cp .env.example .env.local
```

Create the local database and apply the migrations. In your Mac terminal, inside the `Mezout/apps/web` folder:

```
createdb mezout_dev
pnpm db:migrate
```

`DATABASE_URL` in `.env.local` points at it, e.g. `postgres://<your Mac username>@localhost:5432/mezout_dev`. The tests do not need it; they use an in-memory database.

## Run the tests

In your Mac terminal, inside the `Mezout` folder:

```
pnpm test
```

In your Mac terminal, inside the `Mezout/contracts` folder (needs internet; the fork tests read Mezo testnet):

```
forge test -vv
```

## Deploy the router (Mezo testnet)

The relayer key in `.env.local` deploys and needs test BTC from faucet.test.mezo.org. In your Mac terminal, inside the `Mezout/contracts` folder:

```
set -a; source ../.env.local; set +a
forge script script/Deploy.s.sol --rpc-url mezo_testnet --private-key $RELAYER_PRIVATE_KEY --broadcast \
  --verify --verifier sourcify
```

Put the printed address in `.env.local` as `NEXT_PUBLIC_ROUTER_ADDRESS`. To switch production to it, first apply migrations to production (below), then replace the Vercel variable and redeploy. In your Mac terminal, inside the `Mezout` folder:

```
pnpm dlx vercel env rm NEXT_PUBLIC_ROUTER_ADDRESS production --yes
pnpm dlx vercel env add NEXT_PUBLIC_ROUTER_ADDRESS production
pnpm dlx vercel deploy --prod --yes
```

`vercel env add` asks for the value; paste the router address. The relayer only calls the current router and v1 (`mezoutRouterV1` in `packages/sdk/src/addresses.ts`), so links signed for any other router stop working after a switch.

## Seed the MUSD/MEZO pool (Mezo testnet)

Tigris had no MUSD/MEZO pool, so Mezout creates one with test tokens. The first deposit sets the price. The funding key (`TEST_PAYER_PRIVATE_KEY` unless `SEED_PRIVATE_KEY` is set) needs the MUSD, the MEZO from faucet.test.mezo.org and a little test BTC for gas. In your Mac terminal, inside the `Mezout/contracts` folder:

```
MUSD_AMOUNT=250 MEZO_AMOUNT=1000 ./script/seed-mezo-pool.sh
```

## Run the indexer

The indexer runs from `/api/cron`, protected by `CRON_SECRET`. In production, an external scheduler (cron-job.org) calls it every 5 minutes, because Vercel's Hobby plan only allows daily crons and GitHub Actions' 5-minute schedule in practice runs hours apart. `.github/workflows/indexer.yml` stays as a backstop. The checkout also asks for a sync when a payment lands, and reading an unpaid invoice syncs if the index is stale, so invoices usually show paid within seconds. The first run backfills from router v1's deploy block.

To run it once by hand, with the web app running, in your Mac terminal, inside the `Mezout` folder:

```
set -a; source .env.local; set +a
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

## Deploy the web app (Vercel)

In your Mac terminal, inside the `Mezout` folder itself, not `Mezout/apps/web` (the Vercel project link lives at the repo root; from `apps/web` the CLI creates a new, empty project):

```
pnpm dlx vercel deploy --prod --yes
```

Production needs `WEBHOOK_SIGNING_SECRET` and `CRON_SECRET` set in Vercel, and the same `CRON_SECRET` as a GitHub Actions secret for the indexer workflow. In your Mac terminal, inside the `Mezout` folder (each command asks for the value):

```
pnpm dlx vercel env add WEBHOOK_SIGNING_SECRET production
pnpm dlx vercel env add CRON_SECRET production
gh secret set CRON_SECRET
```

Each webhook endpoint's secret is derived from `WEBHOOK_SIGNING_SECRET`, so changing it changes every endpoint's secret.

Pushing to `main` deploys production automatically through Vercel's Git integration; the command above is only needed for a deploy from local changes.

## Scheduler, alerts and status

**Scheduler.** On cron-job.org, create a job:

- URL `https://usemezout.vercel.app/api/cron`, every 5 minutes, method GET
- Header `Authorization: Bearer <CRON_SECRET>` (the value set in Vercel)
- Timeout 60 seconds; turn on notification on failure

**Alerts.** Each scheduled run checks the relayer's gas balance and webhook deliveries that ran out of retries, and reports a run that fails. Alerts go to `ALERT_WEBHOOK_URL`, a Discord or Slack incoming-webhook URL, at most once per alert per window (6 hours for a low balance, 1 hour otherwise). Without it, alerts are only logged. `RELAYER_MIN_BALANCE_BTC` sets the balance threshold (default `0.0001`).

```
pnpm dlx vercel env add ALERT_WEBHOOK_URL production
pnpm dlx vercel env add RELAYER_MIN_BALANCE_BTC production   # optional
```

**Status.** `/api/health` is public. It answers 503 with `status: "degraded"` and a list of `problems` when the relayer balance is below the threshold or the indexer hasn't run for 15 minutes. That second check catches a scheduler that stopped calling `/api/cron`, which no alert from that job could report. Watch it with a second cron-job.org job (or any uptime monitor) every 5 minutes with failure notifications on.

## Apply migrations to production

Production uses a Neon database added through the Vercel integration. Vercel's development and production environments share it, so local development keeps `DATABASE_URL` pointed at local Postgres (`vercel env pull` overwrites that line; set it back afterwards). To migrate production, in your Mac terminal, inside the `Mezout` folder:

```
pnpm --dir apps/web db:migrate:prod
```

This uses `DATABASE_URL_UNPOOLED` (Neon's direct URL) from `.env.local` instead of `DATABASE_URL`.

## Pay an invoice from a script

With the web app running, in your Mac terminal, inside the `Mezout/apps/web` folder (the payer needs test MUSD):

```
APP_URL=http://localhost:3000 ROUTER=<router address> PAYER_PRIVATE_KEY=<test key> API_KEY=<merchant's mzk_test_ key> AMOUNT=25 node scripts/pay-invoice.mjs
```

The script creates the invoice with `POST /v1/invoices`, so it pays the merchant who owns the key. To pay an existing invoice or dashboard link, pass `TOKEN=<the part of the checkout URL after /pay/>` instead of `API_KEY` and `AMOUNT`. Add `METHOD=BTC` or `METHOD=MEZO` to swap instead (the payer needs that token; the slippage cap is 1%, set with `SLIPPAGE_BPS`).

## Run the web app

In your Mac terminal, inside the `Mezout` folder:

```
pnpm --filter @mezout/web dev
```

Then open http://localhost:3000.
