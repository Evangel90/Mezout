# Mezout: hackathon submission answers

## What it does

Mezout is checkout infrastructure for merchants on Mezo. A customer can pay four ways: with MUSD, by borrowing MUSD against their BTC inside the same transaction, with MEZO, or with BTC. Whichever they pick, the merchant receives exactly the invoiced amount in MUSD, and the contract enforces that on-chain.

Merchants don't need a wallet. They sign up with a passkey (Face ID, Touch ID, Windows Hello or a phone), which gives them their own ERC-4337 smart account with no seed phrase and no gas. They can take payments through payment links and QR codes, through a REST API with API keys, or through a WooCommerce plugin. A relayer pays the gas, so customers and merchants never touch it.

The merchant dashboard covers orders with CSV export, refunds, signed webhooks with a delivery log, and gasless withdrawals. Mezout never holds funds or keys.

## The problem it solves

Bitcoin holders don't want to sell their BTC to spend it, and merchants won't install a wallet, store a seed phrase or buy gas tokens to get paid. Crypto checkouts usually fail one side or the other: the customer has to swap first, or the merchant ends up holding a volatile asset and handling keys.

Mezout fixes both sides:

- **For customers:** they can spend BTC-backed value without selling, by borrowing MUSD against their BTC trove at checkout. They can also pay directly in BTC, MEZO or MUSD.
- **For merchants:** they receive a stable, exact amount in MUSD and sign in with a passkey. Payments plug into tools they already use: links, QR codes, an API, webhooks and WooCommerce.
- **For safety:** the router refuses a borrow that would leave the customer's loan below 160% collateral, so checkout can't push someone close to liquidation.

## Challenges I ran into

- **Mezo's signatures work only for regular wallets.** MUSD permit and `withdrawMUSDWithSignature` check signatures with plain ECDSA and don't support ERC-1271. Gasless relayed payments work for EVM wallets, but the Bitcoin wallets in Mezo Passport run through smart accounts and can't sign permits. We built a separate direct path where those accounts approve and call the router themselves.
- **Tigris has no exact-output swap.** Merchants must receive an exact amount, so the router reads the pool's reserves when the payment executes and computes the smallest input that buys exactly the invoiced MUSD, fee included. We fuzzed the formula and checked it on a fork of the real MUSD/BTC pool: the quote passes and the quote minus 1 wei reverts. Nothing is left over to refund, and the customer's signed cap guards against slippage.
- **There was no MUSD/MEZO liquidity on testnet.** We created and seeded our own Tigris pool. Foundry's simulation doesn't include Mezo's BTC and MEZO precompiles, so we funded the pool with `cast` instead of `forge script`.
- **There was no public ERC-4337 bundler on Mezo.** Our relayer calls `handleOps` itself and tops up each account's EntryPoint deposit. OpenZeppelin 5.6 defaults to EntryPoint v0.9, but Mezo only has v0.7, so the account overrides it.
- **Contract verification failed on the explorer.** Its verifier stops at the London EVM version, and our contracts need Cancun for transient storage. We verified on Sourcify instead and got exact matches.
- **Borrow limits go beyond the 160% floor.** A trove also has a `maxBorrowingCapacity` fixed when it was opened, and Recovery Mode matters too. Checkout reads these before it offers the borrow option.
- **Passkeys only work on one domain.** We had to settle on a single canonical domain early and permanently redirect the old one.
- **We ran into smaller infrastructure issues.** Testnet sometimes estimates gas below its own EIP-7623 minimum. Vercel's Hobby plan only allows daily crons, so the indexer runs from GitHub Actions every 5 minutes. Mezo's PriceFeed reverts on a fork, so the tests mock the oracle.

## Technologies I used

- **Mezo:** MUSD (the payment and settlement asset), MUSD borrowing via `BorrowerOperationsSignatures.withdrawMUSDWithSignature`, the Mezo PriceFeed, Mezo Passport, Tigris DEX pools, and the BTC and MEZO precompile tokens with EIP-2612 permits
- **Contracts:** Solidity 0.8.28, Foundry (75 tests, including fork tests against the real MUSD contracts and EntryPoint), OpenZeppelin 5.6, EIP-712, ERC-4337 (EntryPoint v0.7), WebAuthn/P-256 via RIP-7212, Sourcify
- **App:** Next.js 14, React 18, TypeScript, viem, Postgres (Neon) with Drizzle, Vercel, GitHub Actions
- **Integrations:** PHP WooCommerce plugin (classic and block checkouts, HPOS), `@wordpress/env`, HMAC-SHA256 signed webhooks

## How we built it

We built it milestone by milestone, and each milestone ended live on Mezo testnet with reference transactions:

1. **M0, verification first.** Before writing the router, we confirmed every Mezo contract address and checked the signature domains, trove math and protocol constants with read-only calls and fork tests.
2. **M1, core payments.** We built `MezoutRouter` with the MUSD (permit) and borrow paths. Invoices are EIP-712 signed, can be paid once, and include a signed fee field for later. Each payer signature is bound to one invoice, so a copied signature can't pay a different one. We also built the hosted checkout, the gasless relayer, the payment-link dashboard, the merchant API, and passkey smart accounts with gasless withdrawals.
3. **M2, more ways to pay.** We added `payWithBTC` and `payWithMEZO` through exact-output swaps on Tigris and deployed router v2. Router v1 still pays older links.
4. **M3, merchant platform.** We built an on-chain indexer, and an invoice becomes paid only from the router's `Paid` events, never from what the checkout reports. We added signed webhooks with retries, refunds that are verified on-chain, an order list with CSV export, dashboard sessions, idempotency keys and shared rate limits.
5. **M4, WooCommerce.** The gateway marks an order paid only after a signed `invoice.paid` webhook with a matching amount. It also handles link expiry and refunds from the order screen.

The contracts have no upgradeability and no admin keys. The full API reference is published at `/docs`.

## What we learned

- **Read the protocol before designing on it.** Our M0 checks found facts that changed the design: EOA-only signatures, no exact-output swaps, missing liquidity, and a hidden borrow cap.
- **Mezo can run account abstraction already.** EntryPoint v0.7 and the P-256 precompile are live, so on-chain passkey checks are cheap. The missing piece is a public bundler, and a relayer can fill that role.
- **Native BTC and Mezo's BTC ERC-20 share one balance.** That makes gasless BTC payments possible through a permit, without sending `msg.value`.
- **Borrow-to-pay is a strong Bitcoin use case.** Customers spend without selling, but the checkout has to handle the safety side (collateral floors, Recovery Mode, borrowing capacity) so a payment can't put someone at risk.
- **The chain should be the source of truth.** Marking invoices paid only from indexed events, and confirming every refund on-chain, made webhooks and plugins much simpler to trust.
- **Removing the wallet removes the friction.** Passkeys are what make a crypto checkout feel normal to a merchant.

## What's next for Mezout

- **Shopify app (M5).** It will sit alongside the WooCommerce gateway.
- **Embedded checkout.** A drop-in `mezout.js` script, plus a React component, will open the checkout in a modal or popup inside the merchant's own app or site instead of redirecting away. It will tell the page when the payment completes, while fulfilment still comes from the signed webhook.
- **Mainnet readiness.** That means a passkey recovery key, since a lost device currently means a lost account, a security review, and a deployment on Mezo mainnet.
- **Deeper liquidity for MEZO payments.** The current MUSD/MEZO pool is a small test pool that we seeded ourselves.
- **A gasless path for Bitcoin-wallet smart accounts.** Today those accounts pay their own gas.
- **Turning on the fee.** The fee field already exists and is set to 0 during the buildathon, so a sustainable fee needs no contract redeploy.
- **More merchant tools.** These include payouts to exchanges, more ecommerce platforms and in-person QR checkout.
