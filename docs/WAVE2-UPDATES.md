Team: sixthsensestudio · Track: Access & Distribution
App: https://usemezout.vercel.app · Code: https://github.com/Evangel90/Mezout
Deck: https://docs.google.com/presentation/d/10RJVq8lRD7Z0xFnotkZaw59YO21JhrTJ/edit?usp=sharing
Videos: https://youtube.com/shorts/zyVISKU9qg4 · https://youtube.com/shorts/Xok1jkvdRNg · https://youtube.com/shorts/D18EQD7RIhQ · https://youtube.com/shorts/ESvDsBwDNPA

Wave 2 answered the Wave 1 review point by point. All live on Mezo testnet.

1. Close the front-run path on the borrow signature: router v3 detects a copied borrow sent first and completes checkout from the payer's balance, with unit and fork regressions. https://explorer.test.mezo.org/address/0x7151473F1300c2529A2eEFaA517684e974A9b3E6

2. Exercise borrow-to-pay on router v2: a live v2 borrow payment records payer intent, payout and trove ratio (164.81% → 164.20%), plus fork tests of the front-run case. https://github.com/Evangel90/Mezout/blob/main/docs/BORROW_V2_PROOF.md

3. Monitor borrowers after checkout: checkout shows fee rate, interest and liquidation price before a borrow. Afterwards the receipt and /loan show debt, ratio and liquidation price, refreshed every 30s, and let the borrower repay MUSD, add BTC or close the loan. No automatic top-up: the borrower signs every change. Redemption and liquidation alerts come in Wave 3. https://usemezout.vercel.app/loan · Repayment: https://explorer.test.mezo.org/tx/0xa4cbad190237d8b10ff921c3e027f09e3f89e4ed620e866188bd1e8473dac3df

4. A fee that covers relayer gas: gas measured per payment path, then a signed 1% testnet fee in every invoice, with gross, fee and net in checkout, receipts, dashboard and API. https://github.com/Evangel90/Mezout/blob/main/docs/RELAYER_GAS_EVIDENCE.md

5. Real merchants and outside payers: not yet. Onboarding the first merchants is the Wave 3 launch goal.

6. Pitch deck, track and team: deck linked above; fields filled in.

Also new in Wave 2:
- Shopify app (M5): orders marked Paid only from the signed webhook; a dev-store order paid in BTC. https://usemezout.vercel.app/guides/shopify
- Embedded checkout: mezout.js and @mezout/embed-react open checkout in a modal on the merchant's site. https://usemezout.vercel.app/guides/embedded-checkout
- AI agent payments: @mezout/paywall charges per API call over x402, @mezout/mcp lets agents create, pay and refund invoices within caps, plus an agent skill. https://usemezout.vercel.app/guides/ai-agents
- Reliability: router self-review (no fund-loss issues), one relayer transaction at a time, alerts and a health check.
- Redesign: new landing page, dashboard and guides.
