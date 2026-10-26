# Mezout for WooCommerce

A WooCommerce payment gateway for Mezout. Customers pay on Mezo with Bitcoin, MUSD or MEZO, or borrow MUSD against their BTC; the store's Mezout payout address receives the exact order total in MUSD.

- Works with the classic checkout and the block checkout, and with WooCommerce's order tables (HPOS).
- An order is marked paid only by a signed `invoice.paid` webhook whose amount matches the order total. A customer returning to the store proves nothing.
- Unpaid orders are cancelled when their payment link expires (`invoice.expired`).
- Refunds from the WooCommerce order screen become refund requests in Mezout. The merchant sends them from the Mezout dashboard (Mezout never holds funds); `refund.completed` notes the transaction, and `refund.canceled` removes the WooCommerce refund if the merchant declines it. Refunds sent straight from the dashboard are recorded in WooCommerce too.
- Saving the settings checks the API key and registers the store's webhook URL with Mezout, keeping the signing secret. There is nothing to copy except the API key.

The merchant install guide is [`mezout-woocommerce/readme.txt`](mezout-woocommerce/readme.txt).

## How it works

| Step | Code |
| --- | --- |
| Checkout creates an invoice for the order total (`Idempotency-Key` per order and attempt; a still-valid link for the same amount is reused) and redirects to its `checkout_url`. `success_url` brings the customer back to the order-received page. | `WC_Gateway_Mezout::process_payment` |
| The order-received page says the payment is being confirmed and reloads until the webhook has arrived. | `Mezout_Orders::thankyou` |
| `POST /wp-json/mezout/v1/webhook` verifies `Mezout-Signature`, skips events already handled, and updates the order. | `Mezout_Webhook` |
| Refund from the order screen calls `POST /v1/refunds`. | `WC_Gateway_Mezout::process_refund` |
| Block checkout registration, without a build step. | `Mezout_Blocks`, `assets/blocks.js` |

Orders are found from Mezout invoice ids stored as order meta (`_mezout_invoice`, one row per invoice the order had), so an earlier link paid late still matches its order.

## Develop locally

You need Docker Desktop running, Node 20+ and pnpm. WordPress, WooCommerce, MySQL and PHP run in containers through [`@wordpress/env`](https://www.npmjs.com/package/@wordpress/env).

In a terminal, in the `Mezout/plugins/woocommerce` folder:

```bash
pnpm install --ignore-workspace
pnpm start
```

The store is at http://localhost:8888 (admin: `admin` / `password`), with both plugins active. `.wp-env.json` points the plugin at a Mezout dev server on your computer (`MEZOUT_API_BASE=http://host.docker.internal:3000`), so also run Mezout itself: in a second terminal, in the `Mezout/apps/web` folder, `pnpm dev`. A development Mezout delivers webhooks to `http://localhost` addresses; production Mezout delivers only to public https URLs.

To set up a test store (USD, a product and a page with the classic checkout), in the `Mezout/plugins/woocommerce` folder:

```bash
pnpm wp option update woocommerce_currency USD
pnpm wp rewrite structure "/%postname%/" --hard
pnpm wp wc product create --user=admin --name="Mezo Mug" --type=simple --regular_price=2.50 --virtual=true --status=publish
pnpm wp post create --post_type=page --post_status=publish --post_title="Classic checkout" --post_content="[woocommerce_checkout]"
```

Then create a merchant and an API key in the Mezout dashboard at http://localhost:3000/dashboard, and paste the key in WooCommerce → Settings → Payments → Mezout.

## Test

Unit tests for signature verification and amounts run in the WordPress container. In the `Mezout/plugins/woocommerce` folder, with the environment started:

```bash
pnpm test
```

## Build the zip

In the `Mezout/plugins/woocommerce` folder:

```bash
pnpm zip
```

It writes `dist/mezout-woocommerce-<version>.zip`, ready for Plugins → Add New → Upload Plugin.
