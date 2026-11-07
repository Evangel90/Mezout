# Wave 2 merchant pilot (Mezo testnet)

This is a small, consent-based testnet pilot for validating Mezout's merchant and customer flow. It is not a mainnet launch, does not use money with value, and does not authorize Mezout to contact participants or initiate payments.

## Goal

Show that an outside merchant can create an invoice and an outside payer can complete it, while the merchant can reconcile the same payment across the on-chain `Paid` event, Mezout dashboard, CSV export, and signed webhook.

Record enough evidence to answer four questions:

1. Did the payer complete checkout with the expected payment method?
2. Did the merchant receive the expected net MUSD settlement?
3. Did every merchant-facing record agree with the chain?
4. Would the merchant use the flow again, and what blocked them?

## Participant inputs

Before the session, obtain and record only what is needed:

| Participant | Required input | Do not collect |
| --- | --- | --- |
| Merchant | business display name, payout wallet or passkey account, contact method, preferred payment scenario, explicit consent to publish an anonymized result | seed phrase, private key, recovery phrase, full customer list |
| Outside payer | wallet address, payment method they are willing to test, explicit consent to publish an anonymized transaction link | seed phrase, private key, identity documents |
| Pilot operator | merchant API key only if the merchant chooses API invoicing; otherwise the merchant creates the link themselves | a participant's wallet credentials |

Use pseudonyms or a public business name in the evidence table. Do not publish personal contact details or link a payer address to a real identity without their written permission.

## Before the session

1. Confirm every participant understands that this is Mezo **testnet** and test tokens have no value.
2. Confirm the current fee policy: the payer pays the invoice's displayed gross amount; the merchant receives gross minus the signed platform fee. New testnet invoices default to 1% (`MERCHANT_FEE_BPS=100`).
3. Give the merchant the [dashboard](https://usemezout.vercel.app/dashboard), [API reference](API.md), and, if applicable, the [WooCommerce guide](../plugins/woocommerce/README.md) or embedded-checkout setup.
4. Ensure the payer has test BTC for gas if using a Bitcoin-wallet smart account; relayed EVM-wallet payments do not need a gas token.
5. Agree on a small test invoice and a success URL or webhook receiver if the merchant is testing an integration.
6. Choose the payment scenarios below. Do not ask a participant to open or alter a trove just for this pilot.

## Suggested scenarios

Run at least two different paths. A third payer can cover a path not available to the first two.

| Scenario | Payer action | Merchant should verify |
| --- | --- | --- |
| MUSD | Pay a link with MUSD | gross/fee/net settlement and `invoice.paid` |
| BTC or MEZO | Pay a link through the Tigris quote | signed max input, gross/fee/net settlement and `invoice.paid` |
| Borrow-to-pay | An existing, comfortably collateralized Mezo borrower pays with borrow | post-payment debt/ICR view, repay/add-BTC route, gross/fee/net settlement and `invoice.paid` |

For every scenario, the payer must see the gross invoice amount before signing. The fee is not an extra payer charge; it is embedded in the signed invoice and deducted from merchant settlement.

## Session checklist

### Merchant setup

- [ ] Merchant signs in with a passkey account or Mezo wallet.
- [ ] Merchant sets the business name and verifies their payout address.
- [ ] Merchant creates an invoice or payment link and records the displayed gross, platform fee, and net settlement.
- [ ] If testing an integration, merchant configures a signed webhook endpoint and keeps its secret private.
- [ ] If testing embedded checkout, merchant configures only the approved site origin and verifies popup fallback is available.

### Payment and reconciliation

- [ ] Payer opens the link, connects their own wallet, and selects a supported method.
- [ ] Payer confirms that the displayed gross amount is the amount they expect to pay.
- [ ] Record the transaction hash after a confirmed payment; never copy wallet secrets or signature payloads into the evidence log.
- [ ] Open the transaction in the Mezo testnet explorer and confirm a successful `Paid` event with matching order ID, amount and fee.
- [ ] Confirm dashboard status is `paid` and its gross, fee, net, method, payer and transaction hash match the event.
- [ ] Export CSV and confirm the same row matches.
- [ ] If configured, verify the `invoice.paid` webhook signature and matching amount before treating the store order as paid.
- [ ] For borrow-to-pay, record the post-payment ICR risk category only with payer consent; do not publish exact collateral/debt unless they approve.

## Evidence template

Use one row per completed payment. Values in brackets are optional or should be anonymized.

| Date (UTC) | Merchant / alias | Payer alias | Method | Gross MUSD | Fee MUSD | Net MUSD | Transaction | Explorer event | Dashboard / CSV | Webhook verified | Outcome / friction |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| | | | MUSD / BTC / MEZO / BORROW | | | | `0x…` | `Paid` order ID | pass / fail | yes / n.a. | |

For an integration result, additionally record the store order ID, webhook delivery ID, and whether fulfilment was marked paid only after signature verification. Keep raw webhook bodies and secrets out of any public submission.

## Merchant feedback template

Ask these after the session, and quote only with permission:

1. What was clear or unclear about creating a link and sharing it?
2. Was gross / platform fee / net settlement clear before you shared the link?
3. Did dashboard, CSV, and webhook information match what you expected?
4. Would you use this for a testnet store flow again? Why or why not?
5. What is the one change that would make this usable for your business?

## Success and stop criteria

### Success

- At least one outside merchant and two outside payer sessions are completed, with two payment methods represented.
- Every completed payment reconciles across the router event and dashboard; where configured, the signed webhook and CSV also agree.
- The merchant understands that the displayed gross is paid by the customer and the signed fee is deducted from settlement.
- Any failure is recorded with enough detail to reproduce it without collecting secrets.

### Stop and investigate

Stop the pilot and do not ask participants to retry if any of these occur:

- Gross, fee, or net differs between the signed invoice, `Paid` event, dashboard, CSV, or verified webhook.
- A payment succeeds on-chain but cannot be reconciled to its invoice.
- A participant is asked for a seed phrase, private key, or an unexplained signature.
- Borrow-to-pay presents a ratio below the 160% router safety floor or shows stale/conflicting loan data.
- A webhook marks an order paid without a valid Mezout signature and matching amount.

Capture the transaction hash, order ID, time, wallet type, and visible error. Do not continue until the issue is understood and fixed.

## After the pilot

1. Add the anonymized evidence table and approved merchant quote to the Wave 2 submission materials.
2. Compare each payment path's gas cost with the collected fee using [the relayer gas-cost review](RELAYER_GAS_COST.md). Do not change `MERCHANT_FEE_BPS` based on an isolated payment.
3. Update the product backlog with friction found in the session; do not treat a testnet pilot as proof of mainnet readiness.
