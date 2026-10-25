# Wave 1 submission draft (AKINDO)

Draft for the owner to edit and paste into AKINDO. Everything claimed here is live on Mezo testnet as of 25 Oct 2026; planned work is listed only under "Next".

## Name and tagline

**Mezout**: merchant checkout on Mezo. Customers pay with MUSD or borrow against their BTC; merchants get exact MUSD without needing a wallet.

Track: Access & Distribution.

## Short description (about 120 words)

Mezout is checkout infrastructure for merchants who want Bitcoin-backed payments without crypto friction. A merchant signs up with a passkey (Face ID, Touch ID or a phone) and gets their own ERC-4337 smart account: no wallet, no seed phrase, no gas. They share a payment link or QR code, or create invoices from their store through a REST API. Customers pay from their MUSD balance, or borrow MUSD against their BTC in the same transaction, and Mezout's relayer pays the gas. The merchant receives exactly the invoiced amount in MUSD, enforced on-chain, and a borrow that would leave the customer's loan under 160% collateral is refused. Mezout never holds funds or keys.

## The problem

- Merchants will not install a wallet, write down a seed phrase or buy gas tokens to accept a payment.
- Bitcoin holders do not want to sell BTC to spend it.
- A checkout needs to plug into the systems merchants already run: links, QR codes, an API, and later store plugins.

## What is built (Wave 1)

| Area | What works today |
| --- | --- |
| Payments | `MezoutRouter` pays an EIP-712 signed invoice with MUSD (permit) or by borrowing MUSD against the customer's BTC through MUSD's `withdrawMUSDWithSignature`, in one transaction |
| Safety | Exact payout enforced on-chain; 160% collateral floor checked after every borrow; each invoice can be paid once; payer signatures bind every permit and borrow to one invoice, so a copied signature cannot pay a different invoice |
| Gasless | A relayer submits customer payments and pays the gas |
| Walletless merchants | Passkey sign-up and sign-in; `MezoutAccount` (OpenZeppelin ERC-4337 account with a WebAuthn signer, EntryPoint v0.7) receives payouts at an address known before deployment; withdrawals are gasless and confirmed with the passkey |
| Merchant tools | Dashboard with payment links and QR codes; API keys; `POST /v1/invoices` and `GET /v1/invoices/:id` with on-chain status |
| Wallet merchants | Any Mezo Passport wallet can be the payout address instead of a passkey account |

## How it uses Mezo

- **MUSD** is the settlement currency and the payment asset.
- **MUSD borrowing**: customers borrow against their BTC trove inside the payment, via `BorrowerOperationsSignatures.withdrawMUSDWithSignature`, with Mezo's own price feed checked for the safety floor.
- **Mezo Passport** connects customer wallets, including Bitcoin wallets.
- **Mezo testnet** runs the router, the account factory and the canonical ERC-4337 EntryPoint v0.7.

## Try it

- Live app: https://usemezout.vercel.app
- Merchant: open `/dashboard`, choose **Create account with passkey**, then create a payment link. No wallet or test funds needed.
- Customer: open the link with a Mezo testnet wallet holding test MUSD, or a BTC trove to borrow against. Get test BTC from faucet.test.mezo.org.
- API: see `docs/API.md`.

## Links

- Code: https://github.com/Evangel90/Mezout
- MezoutRouter: `0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199` ([explorer](https://explorer.test.mezo.org/address/0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199), [verified source](https://repo.sourcify.dev/31611/0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199))
- MezoutAccountFactory: `0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79` ([explorer](https://explorer.test.mezo.org/address/0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79), [verified source](https://repo.sourcify.dev/31611/0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79))
- Reference transactions:
  - Pay with MUSD: [`0x4f97…cc48`](https://explorer.test.mezo.org/tx/0x4f9731b8b02102690edd793177e9bdc0a4b9456109f9c217d558c5fcd05bcc48)
  - Borrow against BTC: [`0x6b8c…11ae`](https://explorer.test.mezo.org/tx/0x6b8c1ba62cddf247e14837380fbb8c154dc2b87e76d0c1b8afc867ec229711ae)
  - Passkey account withdrawal (deploys the account): [`0x3375…33c2`](https://explorer.test.mezo.org/tx/0x3375cf67ed9c926d50264f3b0ed5855506bbd193299958b0ca7954e9129b33c2)

## Tech

Solidity 0.8.28 with Foundry and OpenZeppelin 5.6 (no upgradeability, no admin keys); 54 contract tests including fork tests against real MUSD contracts and the real EntryPoint. Next.js 14 on Vercel, viem, Mezo Passport, Postgres (Neon) with Drizzle. Contracts verified on Sourcify (exact match).

## Next (Wave 2, by 15 Nov)

1. Pay with MEZO and with BTC, swapped to exact MUSD through Tigris, refunding any unused input (M2).
2. Merchant platform: signed webhooks, payment history, refunds, CSV export (M3).
3. WooCommerce gateway (M4) and Shopify app (M5).

---

# Demo script (about 2 minutes 30 seconds)

Record at 1280×800 in a browser profile with a passkey available, plus a second profile with MetaMask on Mezo testnet holding test MUSD and a BTC trove. Pre-load the explorer tabs.

| Time | Screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Landing page | "Mezout lets merchants accept Bitcoin-backed payments on Mezo and get exact MUSD, without a wallet. Customers pay with MUSD or borrow against their BTC, gas-free." |
| 0:15–0:40 | `/dashboard` → enter a business name → **Create account with passkey** → Touch ID | "A merchant signs up with a passkey. That creates their own smart account on Mezo. No seed phrase, no gas, and Mezout never holds the key." |
| 0:40–0:55 | Create a 25 MUSD payment link; show the QR | "They create a payment link or QR code, or do the same from their store through our API." |
| 0:55–1:30 | Customer profile: open the link → connect MetaMask → **Borrow against my BTC** → show the loan ratio → sign | "The customer doesn't have to sell Bitcoin. They borrow MUSD against their BTC inside the payment. Mezout checks the loan stays above 160% collateral, and our relayer pays the gas." |
| 1:30–1:45 | Explorer: the payment transaction, the Transfer to the merchant and the `Paid` event | "One transaction: the merchant received exactly 25 MUSD." |
| 1:45–2:10 | Back on the dashboard: balance shows 25 MUSD → withdraw 10 to an exchange address → passkey prompt → **Sent** | "The merchant cashes out with their passkey. Still no gas: Mezout sponsors it through ERC-4337." |
| 2:10–2:25 | Terminal: `curl POST /v1/invoices` and the JSON response | "Developers get API keys and a REST API to create and track invoices." |
| 2:25–2:35 | Landing page footer: verified contracts, GitHub | "It's all open source and verified on Mezo testnet. Next up: pay with MEZO or BTC, webhooks, and WooCommerce and Shopify plugins." |
