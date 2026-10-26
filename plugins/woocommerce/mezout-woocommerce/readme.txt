=== Mezout for WooCommerce ===
Contributors: mezout
Tags: bitcoin, crypto, payments, mezo, musd
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Accept Bitcoin, MUSD and MEZO on Mezo. You receive the exact order total in MUSD, straight to your own address.

== Description ==

Mezout adds a payment method to your WooCommerce checkout. Customers pay on Mezo with Bitcoin, MUSD or MEZO, or borrow MUSD against their BTC. Whatever they choose, your Mezout payout address receives the exact order total in MUSD in the same transaction. Mezout never holds your funds.

* Works with the classic checkout and the block checkout.
* Orders are marked paid only when Mezout's signed webhook confirms the payment on-chain, never because a customer returned to your store.
* Unpaid orders are cancelled when the payment link expires.
* Refund from the order screen: Mezout records the request and you send it from the Mezout dashboard. The order updates when it is sent, or if you decline it.

**Testnet only.** Mezout currently runs on Mezo testnet. Payments use test tokens with no value.

== Installation ==

1. Get an API key: open https://usemezout.vercel.app/dashboard, create a merchant account (a passkey or your Mezo wallet), set your business name, then on the Developers tab click Create API key.
2. In WordPress, go to Plugins → Add New → Upload Plugin, choose the zip, then Install and Activate.
3. Go to WooCommerce → Settings → Payments → Mezout. Tick Enable, paste the API key and save. The plugin checks the key and sets up webhooks for your store.
4. Your store currency must be US Dollar (USD) or Mezo USD (MUSD), which the plugin adds to the currency list.

Webhooks need your store to be reachable at a public https address.

== Frequently Asked Questions ==

= When is an order marked paid? =

When Mezout's invoice.paid webhook arrives with a valid signature and the amount matches the order total. This usually takes a few seconds after the customer pays. If the amount does not match, the order is put on hold for you to check.

= Why does a refund need a second step? =

Mezout never holds your funds, so it cannot send money on your behalf. Refunding from WooCommerce records a refund request; you send the MUSD from the Payments tab of the Mezout dashboard. If you decline the request there, the WooCommerce refund is removed again.

= What happens to an order the customer never pays? =

It stays Pending payment until its payment link expires (60 minutes by default, set under Payment link lifetime), then it is cancelled and any held stock is released.

== Changelog ==

= 0.1.0 =
* First release: classic and block checkout, webhook-confirmed payments, link expiry, refunds through the Mezout dashboard, MUSD currency.
