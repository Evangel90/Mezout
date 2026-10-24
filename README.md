# Mezout

Merchant checkout on Mezo: customers pay with MUSD, by borrowing against their BTC, with MEZO, or with BTC, and the merchant always receives the exact invoiced amount in MUSD. Mezout never holds funds. Built for the Mezo Buildathon (Access & Distribution track), Mezo testnet only.

Status: Milestone 0 (setup and verification). See `docs/BRIEF.md` for the plan and `docs/M0-findings.md` for what has been verified.

## Layout

```
contracts/            Foundry project: router, interfaces, tests
apps/web/             Next.js 14: hosted checkout, dashboard, API
packages/sdk/         Typed data, chain config, shared types
plugins/woocommerce/  WooCommerce gateway (Milestone 4)
plugins/shopify/      Shopify app (Milestone 5)
docs/                 Brief and findings
```

## Prerequisites

Node 20+, pnpm 9 (`npm i -g pnpm@9`), Foundry (`forge`), git.

## Setup

In your Mac terminal, inside the `Mezout` folder:

```
git submodule update --init --recursive
pnpm install
cp .env.example .env.local
```

## Run the tests

In your Mac terminal, inside the `Mezout` folder:

```
pnpm test
```

In your Mac terminal, inside the `Mezout/contracts` folder (needs internet; the fork tests read Mezo testnet):

```
forge test -vv
```

## Run the web app

In your Mac terminal, inside the `Mezout` folder:

```
pnpm --filter @mezout/web dev
```

Then open http://localhost:3000.
