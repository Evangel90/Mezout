## What it does

Mezout ([live app](https://usemezout.vercel.app) · [docs](https://usemezout.vercel.app/docs) · [code](https://github.com/Evangel90/Mezout) · [pitch deck](https://docs.google.com/presentation/d/10RJVq8lRD7Z0xFnotkZaw59YO21JhrTJ/edit?usp=sharing)) is checkout for humans and AI agents on Mezo testnet. Customers pay with [MUSD](https://explorer.test.mezo.org/tx/0x4f9731b8b02102690edd793177e9bdc0a4b9456109f9c217d558c5fcd05bcc48), [BTC](https://explorer.test.mezo.org/tx/0x79d84d8a7e4d523b08c757c4e0870107b3fe30d0fd9fdc7827b3e491c544afff) or [MEZO](https://explorer.test.mezo.org/tx/0x3c7ea6fb940eb06f93c1d276129ab94a7dec6d625efa10422918722a0cb8126a), or [borrow MUSD against BTC](https://explorer.test.mezo.org/tx/0x1547b49437c76c1c7baf9ba9eafe2d383b284db49ba6d1f442198a566c9d9208) in the same transaction. Agents pay per request over HTTP 402. The merchant always receives exactly the invoiced MUSD, enforced by [MezoutRouter](https://explorer.test.mezo.org/address/0x7151473F1300c2529A2eEFaA517684e974A9b3E6).

Merchants sign up with a passkey (no seed phrase, no gas) and take payments through links, QR codes, an API, WooCommerce, Shopify or an embedded checkout. Borrowers track and repay their loan at [/loan](https://usemezout.vercel.app/loan). Mezout never holds funds or keys.

## Product videos

- [Pay any way](https://youtube.com/shorts/zyVISKU9qg4)
- [Borrow, don't sell your BTC](https://youtube.com/shorts/Xok1jkvdRNg)
- [AI agents checkout](https://youtube.com/shorts/D18EQD7RIhQ)
- [Mezout checkout](https://youtube.com/shorts/ESvDsBwDNPA)

## The problem it solves

Bitcoin holders don't want to sell BTC to spend it, and merchants won't manage wallets or gas. AI agents now buy things too, and need a way to pay that merchants can trust.

- **Customers** borrow MUSD against BTC instead of selling, or pay in BTC, MEZO or MUSD.
- **Merchants** get exact MUSD inside tools they already use.
- **Agents** pay for API calls in exact MUSD, capped per payment.
- **Safety:** no borrow below 160% collateral; borrowers see interest and liquidation price first.

## Challenges I ran into

- **Front-run borrows.** `withdrawMUSDWithSignature` doesn't bind its caller, so a copied borrow could use up the payer's nonce and block checkout. Router v3 detects it and pays from the payer's balance ([proof](https://github.com/Evangel90/Mezout/blob/main/docs/BORROW_V2_PROOF.md)).
- **Shopify's payments API is partner-only.** We ship a manual payment method with a "Complete payment" button after checkout.
- **Relayer nonce collisions** across Vercel instances, fixed with a Postgres advisory lock.
- **Late cron runs.** GitHub Actions ran hours apart, so an external scheduler now drives the indexer.
- **Loan repayment limits.** Mezo's minimum debt caps repayment, and repaying without sorted-trove hints cost ~2.2M gas.
- **Pricing a fee on testnet.** Testnet assets have no price, so we [measured relayer gas per path](https://github.com/Evangel90/Mezout/blob/main/docs/RELAYER_GAS_EVIDENCE.md) and signed the fee into each invoice.
- **x402 expects a facilitator.** Mezout settles through its router, so the paywall uses x402 v2 with a `mezout` scheme and single-use `/v1/verify`.

## Technologies I used

- **Mezo:** MUSD, BorrowerOperations, PriceFeed, Mezo Passport, Tigris, BTC and MEZO permit tokens
- **Contracts:** Solidity 0.8.28, Foundry (86 tests incl. fork tests), OpenZeppelin 5.6, EIP-712, ERC-4337, WebAuthn/P-256, Sourcify
- **App:** Next.js 14, TypeScript, viem, Neon Postgres, Drizzle, Vercel
- **Integrations:** Shopify app, WooCommerce plugin, `mezout.js`, signed webhooks
- **Agents:** MCP, x402 v2, an [agent skill](https://github.com/Evangel90/Mezout/tree/main/skills/mezout)
- **On npm:** [`@mezout/mcp`](https://www.npmjs.com/package/@mezout/mcp), [`@mezout/paywall`](https://www.npmjs.com/package/@mezout/paywall), [`@mezout/embed-react`](https://www.npmjs.com/package/@mezout/embed-react)

## How we built it

Wave 1 reviewer feedback became the Wave 2 plan, all live on testnet:

1. **Router v3** survives front-run borrows, with unit and fork regressions.
2. **Borrow-to-pay proof:** a [live v2 borrow](https://explorer.test.mezo.org/tx/0x9fe4332cb10d2c2d57f49069d20a9032f21a7ea8dd26ffbf72019cbaffbb911c) recording payer intent, payout and trove ratio (164.81% → 164.20%).
3. **Borrower safety:** a post-checkout loan view and `/loan` to [repay](https://explorer.test.mezo.org/tx/0xa4cbad190237d8b10ff921c3e027f09e3f89e4ed620e866188bd1e8473dac3df), add BTC or close.
4. **Merchant fee:** a signed 1% testnet fee, with gross, fee and net shown everywhere.
5. **Shopify app (M5):** a dev-store order [paid in BTC](https://explorer.test.mezo.org/tx/0x7e93416facb8b74abfaa508733465358fad9872e2774ee76a9c93bb0b369c7f6) and marked Paid from the webhook.
6. **Embedded checkout:** a modal limited to the merchant's allowed sites.
7. **Agent payments:** `/v1/verify`, the x402 paywall, and an MCP server set up with `npx -y @mezout/mcp init`.
8. **Security and operations (M6):** a router self-review found no fund-loss issues; each Low finding got a regression test. Plus relayer locking and alerts.
9. **Redesign:** new site, dashboard and guides.

## What we learned

- Reviewer feedback made the best roadmap: proving borrow-to-pay surfaced the front-running case.
- Signatures that don't bind their caller need a recovery path.
- Borrowers need costs up front and a place to repay.
- Exact-amount, idempotent payments suit agents.
- Serverless needs explicit nonce and schedule coordination.

## What's next for Mezout

- **Mainnet:** passkey recovery, an external security review and launch.
- **Agent wallets:** passkey-approved spending limits in a separate contract.
- **Real merchants:** a pilot, and Shopify App Store and WordPress listings.
- **More:** deeper MEZO liquidity and gasless Bitcoin-wallet payments.
