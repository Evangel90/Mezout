# Mezout — Agent Build Brief & Sign-off

Oct 24, 2026&#32;

## How to use this brief

This brief is the single source of truth for building **Mezout**, a merchant checkout that lets any business accept Bitcoin-backed payments and always receive MUSD. The agent reads it in full before writing code, works milestone by milestone, and stops at every gate marked in Milestones.

- **Precedence:** the locked decisions in Sign-off override everything else in this brief. If the brief conflicts with Mezo's deployed contracts or official docs, the contracts win; flag the conflict to the owner.
- **Verify, never assume:** every address, parameter and function signature here must be checked against [mezo-org/musd](https://github.com/mezo-org/musd) and the [Mezo developer docs](https://mezo.org/docs/developers/getting-started/) before use.
- **Commands:** every command the agent writes into docs or READMEs states exactly where it runs (which terminal and which folder).

### Kickoff prompt

Export this doc as Markdown and save it as `docs/BRIEF.md` in an empty folder named `mezout`. Then, in your **Mac terminal, inside the `mezout` folder**, start your coding agent (for example `claude` for Claude Code) and paste:

```
Read docs/BRIEF.md in full. Confirm back to me, in under 15 bullets: the product, the locked decisions, the open questions, and your plan for Milestone 0. Do not write code until I reply "go".
```

## Product summary

Mezout lets a customer pay with MUSD, MEZO or BTC on Mezo, or borrow against their BTC, in one transaction, and the merchant always receives an exact amount of MUSD. Nobody's funds are ever held by Mezout.

| User | What they get |
| --- | --- |
| Merchant | A store plugin or API, payment links, stable dollar settlement in MUSD, a dashboard with orders, refunds and exports |
| Customer | Spend Bitcoin-backed money without selling BTC; pay with whatever Mezo asset they hold; no gas for relayed payments |
| Developer | A REST API with signed webhooks to add Mezout to any site |

**Buildathon context:** the [Mezo Buildathon](https://mezo.org/blog/mezo-buildathon-is-underway) on AKINDO, Access & Distribution track. Wave 1 submissions close 26 Oct 2026, Wave 2 runs 2–15 Nov, and winners are announced at the online demo on 23 Nov. Every submission must integrate MUSD and/or MEZO and include a working deployment; Mezo testnet is accepted.

## Competitive context

At least one entry already ships borrow-to-pay, so Mezout wins as merchant infrastructure, not as a single checkout flow. Entries found on GitHub as of 24 Oct 2026 (the AKINDO submissions page itself was not reviewed):

| Project | What it does | What it lacks |
| --- | --- | --- |
| [Mezher](https://github.com/woydarko/mezher) | Borrow-to-pay checkout: MUSD permit plus a signed borrow sent straight to the merchant, payment links, QR, dashboards | No store plugins, no MEZO or BTC payment, no database yet, testnet only |
| [MezoLoop](https://github.com/Anu062004/Mezzzzzzzooo) | MUSD checkout API with referral commissions and cashback | No borrow or swap paths, no store plugins |
| [PayLink](https://github.com/Fuuaad05/paylink) | MUSD checkout for digital files, embeddable buy buttons | Digital goods only, MUSD only |
| [MUSD Pay Links](https://github.com/theluckystrike/musd-pay-links) | EIP-681 payment links and QR with payer-side checks | Links only, no platform |
| [MUSD Books](https://github.com/neimasilk/musd-books) | Invoice-referenced MUSD payments and statements | Bookkeeping focus |

**Mezout's four differentiators, in priority order:**

1. Store plugins: a native WooCommerce gateway and a Shopify app.
2. Pay with any Mezo asset (MUSD, MEZO, BTC, or borrow against BTC); the merchant always settles in MUSD.
3. A merchant platform: REST API, signed webhooks, API keys, dashboard.
4. Persistent orders, refunds and exports.

**Rule:** do not copy code from any other buildathon entry. Read them only to understand the landscape.

## Scope

Version 1 runs on Mezo testnet and covers the router contract, hosted checkout, merchant platform and both store integrations.

**In scope**

- `MezoutRouter` contract on Mezo testnet with four payment paths
- Hosted checkout page with Mezo Passport wallet connection
- Merchant dashboard: sign-in with wallet, payout address, API keys, payment links and QR, orders, refunds, CSV export, webhook settings
- REST API and signed webhooks
- Relayer for gasless signed payments
- WooCommerce payment gateway plugin, including the block-based checkout
- Shopify app using a manual payment method plus a redirect to hosted checkout
- A TypeScript SDK package for typed data, hints and quotes

**Out of scope for v1**

- Mainnet deployment (only after a professional audit and owner sign-off)
- Paying from Bitcoin L1 (bridging is slow; later phase)
- A native Shopify payments app (Shopify's payments platform is invitation-only)
- Fiat off-ramps, custodial balances, merchants settling in MEZO
- MUSD on Base or Ethereum (post-buildathon)

## Payment paths and protocol facts

Every path ends with the merchant receiving exactly the invoiced MUSD in a single transaction that reverts entirely on any failure.

| Path | Customer holds | Mechanism | Limits |
| --- | --- | --- | --- |
| `MUSD` | MUSD | EIP-2612 permit, router pulls MUSD and sends it to the merchant | None beyond balance |
| `BORROW` | An existing MUSD loan (trove) on Mezo, optionally some MUSD | Permit for the balance part, plus `withdrawMUSDWithSignature` for the rest | Trove must stay at or above the 160% safety floor; blocked in Recovery Mode |
| `MEZO` | MEZO | Exact-output swap MEZO→MUSD on Tigris, leftover MEZO refunded | Slippage cap and quote expiry |
| `BTC` | Native BTC on Mezo | Exact-output swap BTC→MUSD on Tigris, leftover BTC refunded | Slippage cap and quote expiry |

Opening a new trove at checkout is allowed only for orders large enough to meet the minimum loan size. It is a separate step before `BORROW`, not its own path.

**Protocol facts** (from the [MUSD docs](https://github.com/mezo-org/musd/blob/main/docs/README.md); verify each on-chain, all are governable):

- MUSD is a fork of Threshold USD, itself a Liquity fork. Loans are troves kept in a list sorted by collateral ratio, so opening or adjusting one needs `upperHint` and `lowerHint` from `HintHelpers` and `SortedTroves`.
- Minimum collateral ratio 110%. Below a 150% system-wide ratio the protocol enters Recovery Mode, where debt increases must also raise the trove's ratio above 150%.
- Minimum net debt is 1,800 MUSD. Opening a trove also adds 200 MUSD of gas compensation to the debt.
- Borrowing fee 0.1%, plus fixed simple interest set per trove at opening.
- `BorrowerOperationsSignatures` exposes `*WithSignature` functions with EIP-712 signatures, nonces and deadlines. Confirm in the contract source that the `WithdrawMUSD` typed data includes a recipient field that can be set to the merchant or the router.
- MUSD implements EIP-2612 permit. Read the exact EIP-712 domain name and version from the deployed contract.
- Mezo's price oracle is a native precompile that Foundry's EVM does not have. Fork tests must mock or pin `PriceFeed.fetchPrice()`.
- MEZO has no on-chain price oracle. MEZO payments are priced only through a Tigris quote with a slippage cap.
- Find out whether the Tigris router accepts native BTC directly or needs the BTC ERC-20 representation, and document the answer.

## Architecture

The platform signs invoices and watches the chain; only the router moves money, straight from the customer to the merchant.

&#91;embedded content: Mezout architecture · 9 steps from invoice to paid order\]

1. The store plugin (or any site) creates an invoice through the Mezout API.
2. The API returns a checkout link, and the store redirects the customer to it.
3. The customer connects a wallet and signs: a permit, a borrow authorization, or a swap approval.
4. Hosted checkout sends the signed payment to the relayer. A customer may instead submit it directly and pay their own gas.
5. The relayer simulates the call, then submits it to `MezoutRouter`.
6. The router pulls MUSD, borrows against the customer's trove, or swaps on Tigris.
7. The router sends the exact invoiced MUSD to the merchant's payout wallet.
8. The indexer picks up the `Paid` event.
9. A signed webhook tells the store to mark the order paid.

## Smart contract spec: MezoutRouter

One router contract on Mezo testnet. It has no upgradeability, holds no funds between transactions, and pays each invoice at most once.

**Invoice** (EIP-712 typed data, signed by the platform's invoice signer key):

```
struct Invoice {
  address merchant;   // payout address, receives MUSD
  uint256 amount;     // MUSD, 18 decimals
  bytes32 orderId;    // platform invoice id
  uint64  expiry;     // unix seconds
}
```

**Functions** (all take `Invoice` plus the invoice signature):

1. `payWithMUSD(invoice, invSig, permitSig)`: pulls `amount` from the payer by permit and sends it to `merchant`.
2. `payWithBorrow(invoice, invSig, fromBalance, permitSig, borrowSig)`: pulls `fromBalance` by permit, borrows `amount - fromBalance` from the payer's trove through `withdrawMUSDWithSignature`, then checks the trove's ratio is at least 160% or reverts.
3. `payWithMEZO(invoice, invSig, maxMezoIn, quoteDeadline, …)`: pulls up to `maxMezoIn` MEZO (permit if MEZO supports it, otherwise a prior approval), swaps exact-output to `amount` MUSD on Tigris, pays the merchant, refunds unused MEZO.
4. `payWithBTC(invoice, invSig, quoteDeadline)` (payable): swaps exact-output to `amount` MUSD on Tigris, pays the merchant, refunds unused BTC.
5. `refund(orderId, payer, amount)`: called by the merchant; moves MUSD from merchant to payer and emits an event tied to the order.

**Events:** `Paid(orderId, merchant, payer, amount, method, assetIn, amountIn, borrowed)` and `Refunded(orderId, merchant, payer, amount)`.

**Invariants**, each with a test:

- [ ] The router's MUSD, MEZO and BTC balances are zero after every call.
- [ ] The merchant receives exactly `amount` MUSD.
- [ ] An invoice cannot be paid twice, after `expiry`, or with a tampered field.
- [ ] Borrowed MUSD can reach only the merchant named in the signed invoice.
- [ ] A borrow that would leave the trove under 160% reverts.
- [ ] A front-run permit does not block or redirect the payment.
- [ ] Swaps revert past the slippage cap or quote deadline.

**Tests:** Foundry unit tests with mocks, fuzz tests on amounts, and fork tests against the real Mezo testnet contracts with the price precompile pinned. Use Solidity 0.8.28 and OpenZeppelin 5.

## Backend, checkout and plugins

The off-chain side is one Next.js app (API, checkout, dashboard) plus two store plugins. Every order state change comes from the chain, never from the browser.

**API** (all routes need a merchant API key):

| Route | Purpose |
| --- | --- |
| `POST /v1/invoices` | Create an invoice (amount, currency MUSD, order reference, expiry); returns `checkout_url` |
| `GET /v1/invoices/:id` | Status: `pending`, `paid`, `expired`, `refunded` |
| `POST /v1/refunds` | Prepare a refund for the merchant to sign |

**Webhooks:** events `invoice.paid`, `invoice.expired`, `refund.completed`. Each is signed with HMAC-SHA256, carries an idempotency key, and is retried with exponential backoff for 24 hours. Every attempt is logged in the dashboard.

**Database** (Postgres, Drizzle ORM): `merchants`, `api_keys` (hashed), `invoices`, `payments`, `refunds`, `webhook_deliveries`.

**Indexer:** watches `Paid` and `Refunded` events, backfills from the router's deploy block, and waits one block before marking an invoice paid.

**Relayer:** a server-only key funded with test BTC for gas. It validates each request, simulates before sending, rate-limits per IP and per payer, and never logs signatures.

**Hosted checkout** (`/pay/:invoiceId`):

1. Connect a wallet with Mezo Passport (Bitcoin wallets such as Xverse and Unisat, and EVM wallets such as MetaMask).
2. Read MUSD, MEZO and BTC balances and any trove; show only the paths that can work.
3. Show the quote: amount, fees, slippage, and for `BORROW` the trove ratio before and after. Quotes expire after 60 seconds.
4. Collect signatures, send them to the relayer, and show a live status until paid.

**Merchant dashboard:** sign in with the wallet (SIWE), set the payout address, manage API keys, create payment links and QR codes, view orders and refunds, export CSV, configure webhooks.

**WooCommerce plugin** (PHP, `WC_Payment_Gateway`):

- Settings: API key, webhook secret, test mode.
- `process_payment` creates an invoice through the API and redirects the buyer to `checkout_url`.
- A REST route receives webhooks, verifies the HMAC, and calls `payment_complete()`.
- Supports both the classic checkout and the block-based checkout.
- `process_refund` calls the refunds API.

**Shopify app** (Shopify's Remix app template):

- The merchant adds a manual payment method named "Pay with Bitcoin (Mezout)".
- An extension on the order status page shows a "Complete payment" button that opens hosted checkout for that order.
- On `invoice.paid`, the app marks the order paid through the Admin API.
- First confirm which checkout extension targets are available on non-Plus plans, and record the answer.

## Tech stack, repo layout and network config

The project is a pnpm monorepo. Contracts use Foundry; everything off-chain is TypeScript, except the WooCommerce plugin, which is PHP.

| Layer | Choice |
| --- | --- |
| Contracts | Solidity 0.8.28, Foundry, OpenZeppelin 5 |
| Web app, API, relayer | Next.js 14+, viem, wagmi, RainbowKit with `@mezo-org/passport`, TanStack Query |
| Database | Postgres with Drizzle ORM |
| Tests | Foundry (unit, fuzz, fork), Vitest |
| WooCommerce | PHP 8.1+, WooCommerce 8+, tested on a local WordPress install |
| Shopify | Shopify CLI, Remix app template |

```
mezout/
  contracts/              Foundry project: src, test, script
  apps/web/               Next.js: /pay checkout, /dashboard, /api (v1 + relay)
  packages/sdk/           typed data, hints, quotes, ABIs, shared types
  plugins/woocommerce/    mezout-gateway PHP plugin
  plugins/shopify/        Shopify app
  docs/BRIEF.md           this brief
  .env.example            names only, never values
```

**Networks:**

| Network | Chain ID | RPC | Explorer |
| --- | --- | --- | --- |
| Mezo testnet | 31611 | `https://rpc.test.mezo.org` | `explorer.test.mezo.org` |
| Mezo mainnet | 31612 | `https://mezo.drpc.org` (more in the docs) | `explorer.mezo.org` |

Test BTC comes from `faucet.test.mezo.org`; test MUSD is borrowed against it at `testnet.mezo.org`.

**Known addresses**, taken from third-party READMEs and to be confirmed against `mezo-org/musd` deployments before use:

| Contract | Network | Address |
| --- | --- | --- |
| MUSD | Testnet | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| BorrowerOperations | Testnet | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| BorrowerOperationsSignatures | Testnet | `0xD757e3646AF370b15f32EB557F0F8380Df7D639e` |
| TroveManager | Testnet | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| MUSD | Mainnet | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` |

Still to find: `HintHelpers`, `SortedTroves`, `PriceFeed`, the MEZO token, and the Tigris router and pool addresses.

**Environment variables:** `RELAYER_PRIVATE_KEY`, `INVOICE_SIGNER_PRIVATE_KEY`, `DATABASE_URL`, `MEZO_RPC_URL`, `WEBHOOK_SIGNING_SECRET`. Keys are server-only and never committed.

Sources: [Mezo developer docs](https://mezo.org/docs/developers/getting-started/), [MUSD Pay Links](https://github.com/theluckystrike/musd-pay-links), [Mezher](https://github.com/woydarko/mezher)

## Milestones and acceptance criteria

M0 and M1 must be done by Sunday 26 Oct for the Wave 1 submission. M2–M6 fill the gap before Wave 2 closes on 15 Nov. A milestone is done only when every box is ticked; the agent stops at each **gate** and waits for the owner.

### M0 — Setup and verification (24 Oct)

- [ ] Monorepo scaffolded to the layout above; `pnpm install` and `forge build` pass
- [ ] Every address in the network table confirmed against official Mezo sources, plus the missing ones found
- [ ] A fork test reads a real testnet trove and its ratio, with the price precompile pinned
- [ ] The `WithdrawMUSD` typed data and the MUSD permit domain confirmed from contract source
- [ ] **Gate:** owner reviews the findings

### M1 — Wave 1 MVP (26 Oct)

- [x] `payWithMUSD` and `payWithBorrow` with invoice signing, deployed and verified on Mezo testnet (verified on Sourcify; the Mezo explorer cannot verify Cancun builds)
- [x] Hosted checkout with Mezo Passport pays a test invoice end to end through the relayer
- [x] Merchant can create a payment link and QR from a minimal dashboard page
- [x] README with what it is, the live link, contract address, and how to run it (every command says where it runs)
- [x] Two reference testnet transactions linked in the README
- [ ] **Gate:** owner submits Wave 1 on AKINDO

### M2 — Swap paths (31 Oct)

- [ ] `payWithMEZO` and `payWithBTC` via Tigris, with slippage cap, deadline and leftover refunds
- [ ] Checkout shows only the paths the connected wallet can actually use
- [ ] Fork tests for both swap paths, including slippage failures

### M3 — Merchant platform (4 Nov)

- [ ] Postgres schema, API routes and API keys
- [ ] Indexer with backfill; invoices move to `paid` from chain events only
- [ ] Signed webhooks with retries and a delivery log
- [ ] Refunds, order list and CSV export in the dashboard

### M4 — WooCommerce plugin (8 Nov)

- [ ] Gateway works on both the classic and block checkouts of a local WordPress + WooCommerce store
- [ ] Order is marked paid only by a verified webhook; refunds work from the WooCommerce admin
- [ ] Plugin zip and install guide

### M5 — Shopify app (12 Nov)

- [ ] Installs on a Shopify development store; manual payment method plus "Complete payment" button
- [ ] Order is marked paid in Shopify after `invoice.paid`

### M6 — Wave 2 submission (15 Nov)

- [ ] Self security review of the router, with findings fixed or documented
- [ ] Demo video under 3 minutes covering all four paths and both plugins
- [ ] **Gate:** owner submits Wave 2; demo day is 23 Nov

## Agent working rules

The agent builds on testnet only, proves protocol behaviour with tests instead of assuming it, and asks before anything irreversible.

**Always**

- Read the source of any Mezo contract before calling it. When behaviour is unclear, write a fork test that shows it.
- Ship tests with every contract change. `forge test` and `pnpm test` must pass before a task counts as done.
- Commit in small, described steps, and keep `README.md` and `CHANGELOG.md` current.
- In every doc and README, state where each command runs (which terminal, which folder).
- Keep secrets in `.env.local` only, with names in `.env.example`.

**Never**

- Deploy to mainnet, use real funds, or spend money on services without the owner's written approval.
- Copy code from other buildathon entries. Code from official `mezo-org` repos may be used under its license; `mezo-org/musd` is GPL-3.0, so prefer writing minimal interfaces over copying its sources.
- Change a locked decision, the router's trust model, or the 160% safety floor on its own.
- Log, store, or send signatures or private keys anywhere except where the flow needs them.

**Ask the owner first** when a locked decision blocks progress, a dependency is paid, or an open question below needs answering to continue.

## Sign-off

The owner's approval below authorizes the agent to start M0 and M1 under these locked decisions. Anything outside them needs a new sign-off.

**Locked decisions**

| Decision | Choice |
| --- | --- |
| Product | Merchant checkout platform, named Mezout |
| Buildathon track | Access & Distribution |
| Network | Mezo testnet only until an audit and owner approval |
| Merchant settlement | Always MUSD: exactly the invoiced amount minus the signed platform fee, which the merchant pays (0% during the buildathon) |
| Customer payment options | MUSD, borrow against BTC, MEZO, native BTC on Mezo |
| Custody | None; the router holds nothing between transactions |
| Upgradeability | None; fixes ship as a new router deployment |
| Borrow safety floor | Trove ratio must stay at or above 160% after payment |
| Invoice authenticity | EIP-712 invoices signed by the platform's invoice signer key |
| Store integrations | WooCommerce native gateway first; Shopify through a manual payment method plus redirect |
| Platform fee | 0% during the buildathon |

**Open questions for the owner**

- [x] Add a pause switch for new payments held by a 2-of-3 multisig? Recommended, given Mezo's two security incidents this year; it adds an admin key. Decided 24 Oct: no pause switch for now; the router has no admin key.
- [x] Hosting: Vercel plus a managed Postgres (Neon or Supabase)? Decided 24 Oct: Vercel, with Neon Postgres unless the owner prefers Supabase.
- [x] Fee level after the buildathon. Decided 24 Oct: a fee will apply after the buildathon, level to be set; it stays 0% until then, and the router design must leave room for it.
- [x] Confirm Wave 1 is submitted by 26 Oct; the announcement says Wave 1 projects advance to Wave 2, so skipping it may forfeit Wave 2. Confirmed 24 Oct: the owner submits Wave 1 by 26 Oct.

**Decisions at the M0 gate (24 Oct)** — findings in `docs/M0-findings.md`

| Question | Decision |
| --- | --- |
| Who pays the platform fee | The merchant: the invoice carries a signed fee (0 now), deducted from the payout; the router is built with this field from M1 |
| Gasless signatures are EOA-only | Wave 1 demo uses an EVM wallet through the relayer; Bitcoin-wallet accounts get a direct, self-paid path once verified |
| No MUSD/MEZO liquidity on testnet | Create and fund a MUSD/MEZO test pool on Tigris in M2 |
| Tigris has no exact-output swap | Router computes the exact input from the pool's reserves, swaps only that, and refunds unused BTC or MEZO (standard Tigris pools only) |

**Decision after M1 (24 Oct)**

| Question | Decision |
| --- | --- |
| Merchants without a wallet | Brought into Wave 1 at the owner's request: merchants can sign up with a passkey. Each passkey owns a `MezoutAccount` (OpenZeppelin ERC-4337 account with a WebAuthn signer, EntryPoint v0.7) that receives payouts; Mezout's relayer bundles and sponsors withdrawals. Mezout holds no keys and custody is unchanged. Wallet merchants work as before. |

**Approval**

- [ ] Approved to start M0 and M1 — @DefiDevrel

Date approved: \_\_\_\_\_\_\_\_\_\_\_\_
