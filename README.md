# Mezout

Merchant checkout on Mezo: customers pay with MUSD, by borrowing against their BTC, with MEZO, or with BTC, and the merchant always receives the exact invoiced amount in MUSD. Mezout never holds funds. Built for the Mezo Buildathon (Access & Distribution track), Mezo testnet only.

Status: Milestone 2 built: customers can pay with MEZO or BTC, swapped to exact MUSD on Tigris, live on testnet. Already built in M1: the router (MUSD and borrow paths), hosted checkout, relayer, payment-link dashboard, a minimal merchant API (API keys, create and retrieve invoices) and walletless merchant accounts (passkey smart accounts, ERC-4337) are built and tested; deployed to Mezo testnet with live reference payments. See `docs/BRIEF.md` for the plan, `docs/M0-findings.md` for what has been verified and `docs/API.md` for the API.

## Testnet deployment

| | |
| --- | --- |
| Live app | https://usemezout.vercel.app (dashboard: `/dashboard`, status: `/api/health`) |
| MezoutRouter | [`0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431`](https://explorer.test.mezo.org/address/0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431) (block 16,367,275): MUSD, borrow, MEZO and BTC |
| MezoutRouter v1 | [`0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199`](https://explorer.test.mezo.org/address/0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199) (block 16,341,328): MUSD and borrow only; still pays links made before 25 Oct |
| MezoutAccountFactory | [`0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79`](https://explorer.test.mezo.org/address/0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79) (block 16,343,339) |
| Tigris MUSD/MEZO pool | [`0x8eb88d745B0aFFF9D71AbC40d7F550Cded7bB342`](https://explorer.test.mezo.org/address/0x8eb88d745B0aFFF9D71AbC40d7F550Cded7bB342): created by Mezout with test tokens at 1 MUSD per MEZO (80 + 80) |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (canonical, already on Mezo) |
| Invoice signer | `0x289E256BF9Fb2ce0AF3186B015c371C5b3965943` |
| Fee recipient | `0x36A95C939Fa70F29421261C770160645Efa9F9E4` |
| Network | Mezo testnet, chain 31611 |
| Source verification | Sourcify, exact match: [MezoutRouter](https://repo.sourcify.dev/31611/0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431), [v1](https://repo.sourcify.dev/31611/0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199), [MezoutAccountFactory](https://repo.sourcify.dev/31611/0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79). The Mezo explorer's verifier only supports EVM versions up to London, so it cannot verify Cancun builds |

### Reference transactions (24 Oct 2026)

All relayed by `0x7ECf…9a15`, so the customer paid no gas. Merchant `0x36A9…F9E4` unless noted.

| Path | Amount | Transaction | Gas |
| --- | --- | --- | --- |
| Pay with MUSD (permit) | 100 MUSD | [`0x4f97…cc48`](https://explorer.test.mezo.org/tx/0x4f9731b8b02102690edd793177e9bdc0a4b9456109f9c217d558c5fcd05bcc48) | 138,637 |
| Borrow against BTC | 150 MUSD, all borrowed; loan ratio 198% → 184% | [`0x6b8c…11ae`](https://explorer.test.mezo.org/tx/0x6b8c1ba62cddf247e14837380fbb8c154dc2b87e76d0c1b8afc867ec229711ae) | 513,935 |
| Pay with MUSD, invoice from production `POST /v1/invoices` | 12.5 MUSD to a new API merchant `0x9013…81C9` | [`0xf80d…2ade`](https://explorer.test.mezo.org/tx/0xf80ddf1aa4f9618eb00942606741d017941355fe568b314d87b11e9fd20e2ade) | 150,000 |

### Pay with BTC or MEZO (25 Oct 2026)

Relayed, so the customer paid no gas. Each time the customer was charged exactly the router's quote and the merchant received exactly the invoiced MUSD.

| Path | Amount | Transaction |
| --- | --- | --- |
| Pay with BTC from `scripts/pay-invoice.mjs` | 1 MUSD for 0.0000127 BTC | [`0x264e…a06b`](https://explorer.test.mezo.org/tx/0x264ee62d25265c7686153f0962ad96d8dc44272fc07e2ef297de5dab8819a06b) |
| Pay with BTC clicked through the checkout in Chrome | 1 MUSD | [`0x79d8…afff`](https://explorer.test.mezo.org/tx/0x79d84d8a7e4d523b08c757c4e0870107b3fe30d0fd9fdc7827b3e491c544afff) |
| Pay with MEZO clicked through the checkout in Chrome | 2 MUSD for 2.052 MEZO | [`0x3c7e…126a`](https://explorer.test.mezo.org/tx/0x3c7ea6fb940eb06f93c1d276129ab94a7dec6d625efa10422918722a0cb8126a) |

### Passkey merchant account (24 Oct 2026)

Driven through the dashboard in Chrome with a virtual passkey: account created without a wallet, paid 3 MUSD by a customer, API key created with the passkey, then two withdrawals. The account never held BTC.

| Step | Transaction |
| --- | --- |
| First withdrawal, 2 MUSD (also deploys the account through EntryPoint v0.7) | [`0x1a64…e478`](https://explorer.test.mezo.org/tx/0x1a6425e129bd79336a399f2016c75374d3ebfdc34d3815f1cb53c7ffe433e478) |
| Second withdrawal after signing out and back in with the passkey | [`0x0963…2f43`](https://explorer.test.mezo.org/tx/0x09633b328d2fc193d6f2c128004b053d67480a717e35d729eceead8939692f43) |

## How a payment works

1. The merchant creates a payment link in `/dashboard`, or their backend calls `POST /v1/invoices` with an API key (see `docs/API.md`). The server signs an EIP-712 invoice (merchant, amount, fee, order id, expiry) with the invoice signer key; the link carries the signed invoice.
2. The customer opens `/pay/<link>`, connects a wallet with Mezo Passport, and picks **Pay with MUSD**, **Pay with BTC**, **Pay with MEZO** or **Borrow against my BTC**. Only options the wallet can use are shown.
3. The customer signs a `Payment` message naming that invoice, plus an MUSD permit and, for borrowing, a `WithdrawMUSD` authorization. For BTC or MEZO they sign a `SwapPayment` (invoice, token, a cap of the live quote plus 1%, and a 5-minute deadline) and a permit for that cap.
4. The relayer (`/api/relay`) simulates the call and submits it to `MezoutRouter`, paying the gas.
5. The router sends the merchant exactly the invoiced amount minus the fee in one transaction, and reverts if a borrow would leave the customer's loan under 160%.

For BTC and MEZO, the router reads the Tigris pool's reserves when the payment lands, computes the least input that buys exactly the invoiced MUSD, and moves only that from the customer straight into the pool. Nothing is left over to refund, and a payment that would cost more than the signed cap reverts. BTC is paid through Mezo's BTC ERC-20, which shares its balance with native BTC.

Bitcoin wallets in Passport use smart accounts, which cannot sign permits, so they approve and call the router directly and pay their own gas.

Payment links name the router they were signed for. Links from before 25 Oct carry none and are paid through router v1 (MUSD and borrow only).

## Merchants without a wallet

On `/dashboard` a merchant can choose **Create account with passkey** instead of connecting a wallet. The passkey (Face ID, Touch ID, Windows Hello or a phone) owns a `MezoutAccount`: an OpenZeppelin ERC-4337 account with a WebAuthn signer, at an address fixed by the passkey's public key. Payouts land there before the account even exists on-chain.

To withdraw, the merchant enters an address and amount and confirms with the passkey. The server builds the user operation, the passkey signs its hash, and the relayer checks the signature, tops up the account's EntryPoint deposit and submits it through EntryPoint v0.7. The first withdrawal deploys the account. The relayer only submits single MUSD transfers out of registered accounts. Mezout never sees the passkey's private key and cannot move the funds.

A passkey is bound to this site's domain, `usemezout.vercel.app`; the first domain, `mezout-snowy.vercel.app`, permanently redirects there (`apps/web/src/middleware.ts`). Moving the app to another domain, or losing every device that holds the passkey, means losing access to the account; adding a recovery key is planned before any mainnet use.

## Layout

```
contracts/            Foundry project: router, interfaces, tests
apps/web/             Next.js 14: hosted checkout, dashboard, API
packages/sdk/         Typed data, chain config, shared types
plugins/woocommerce/  WooCommerce gateway (Milestone 4)
plugins/shopify/      Shopify app (Milestone 5)
docs/                 Brief, findings and API reference
```

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

## Deploy the web app (Vercel)

In your Mac terminal, inside the `Mezout` folder itself, not `Mezout/apps/web` (the Vercel project link lives at the repo root; from `apps/web` the CLI creates a new, empty project):

```
pnpm dlx vercel deploy --prod --yes
```

## Apply migrations to production

Production uses a Neon database added through the Vercel integration. Vercel's development and production environments share it, so local development keeps `DATABASE_URL` pointed at local Postgres (`vercel env pull` overwrites that line; set it back afterwards). To migrate production, in your Mac terminal, inside the `Mezout/apps/web` folder:

```
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' ../../.env.local | cut -d= -f2- | tr -d '"')" pnpm db:migrate
```

## Pay an invoice from a script

With the web app running, in your Mac terminal, inside the `Mezout/apps/web` folder (the payer needs test MUSD):

```
APP_URL=http://localhost:3000 ROUTER=<router address> PAYER_PRIVATE_KEY=<test key> MERCHANT=<payout address> AMOUNT=25 node scripts/pay-invoice.mjs
```

To pay an invoice created with `POST /v1/invoices`, pass `TOKEN=<the part of checkout_url after /pay/>` instead of `MERCHANT` and `AMOUNT`. Add `METHOD=BTC` or `METHOD=MEZO` to swap instead (the payer needs that token; the slippage cap is 1%, set with `SLIPPAGE_BPS`).

## Run the web app

In your Mac terminal, inside the `Mezout` folder:

```
pnpm --filter @mezout/web dev
```

Then open http://localhost:3000.
