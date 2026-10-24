# Mezout

Merchant checkout on Mezo: customers pay with MUSD, by borrowing against their BTC, with MEZO, or with BTC, and the merchant always receives the exact invoiced amount in MUSD. Mezout never holds funds. Built for the Mezo Buildathon (Access & Distribution track), Mezo testnet only.

Status: Milestone 1 in progress. The router (MUSD and borrow paths), hosted checkout, relayer and payment-link dashboard are built and tested; deployed to Mezo testnet with two live reference payments. See `docs/BRIEF.md` for the plan and `docs/M0-findings.md` for what has been verified.

## Testnet deployment

| | |
| --- | --- |
| MezoutRouter | [`0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199`](https://explorer.test.mezo.org/address/0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199) (block 16,341,328) |
| Invoice signer | `0x289E256BF9Fb2ce0AF3186B015c371C5b3965943` |
| Fee recipient | `0x36A95C939Fa70F29421261C770160645Efa9F9E4` |
| Network | Mezo testnet, chain 31611 |

### Reference transactions (24 Oct 2026)

Both relayed by `0x7ECf…9a15`, so the customer paid no gas. Merchant `0x36A9…F9E4`.

| Path | Amount | Transaction | Gas |
| --- | --- | --- | --- |
| Pay with MUSD (permit) | 100 MUSD | [`0x4f97…cc48`](https://explorer.test.mezo.org/tx/0x4f9731b8b02102690edd793177e9bdc0a4b9456109f9c217d558c5fcd05bcc48) | 138,637 |
| Borrow against BTC | 150 MUSD, all borrowed; loan ratio 198% → 184% | [`0x6b8c…11ae`](https://explorer.test.mezo.org/tx/0x6b8c1ba62cddf247e14837380fbb8c154dc2b87e76d0c1b8afc867ec229711ae) | 513,935 |

## How a payment works

1. The merchant creates a payment link in `/dashboard`. The server signs an EIP-712 invoice (merchant, amount, fee, order id, expiry) with the invoice signer key; the link carries the signed invoice.
2. The customer opens `/pay/<link>`, connects a wallet with Mezo Passport, and picks **Pay with MUSD** or **Borrow against my BTC**.
3. The customer signs a `Payment` message naming that invoice, plus an MUSD permit and, for borrowing, a `WithdrawMUSD` authorization.
4. The relayer (`/api/relay`) simulates the call and submits it to `MezoutRouter`, paying the gas.
5. The router sends the merchant exactly the invoiced amount minus the fee in one transaction, and reverts if a borrow would leave the customer's loan under 160%.

Bitcoin wallets in Passport use smart accounts, which cannot sign MUSD permits, so they pay with MUSD directly from their account and pay their own gas.

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

## Deploy the router (Mezo testnet)

The relayer key in `.env.local` deploys and needs test BTC from faucet.test.mezo.org. In your Mac terminal, inside the `Mezout/contracts` folder:

```
set -a; source ../.env.local; set +a
forge script script/Deploy.s.sol --rpc-url mezo_testnet --private-key $RELAYER_PRIVATE_KEY --broadcast \
  --verify --verifier blockscout --verifier-url https://api.explorer.test.mezo.org/api/
```

Put the printed address in `.env.local` as `NEXT_PUBLIC_ROUTER_ADDRESS`.

## Pay an invoice from a script

With the web app running, in your Mac terminal, inside the `Mezout/apps/web` folder (the payer needs test MUSD):

```
APP_URL=http://localhost:3000 ROUTER=<router address> PAYER_PRIVATE_KEY=<test key> MERCHANT=<payout address> AMOUNT=25 node scripts/pay-invoice.mjs
```

## Run the web app

In your Mac terminal, inside the `Mezout` folder:

```
pnpm --filter @mezout/web dev
```

Then open http://localhost:3000.
