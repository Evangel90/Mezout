Mezout adds a payment method to your WooCommerce checkout. Customers pay with Bitcoin, MUSD or MEZO, or borrow MUSD against their BTC. Whatever they choose, you get the exact order total in MUSD, straight to your payout address. Mezout never holds your funds.

- Works with the classic checkout and the block checkout.
- Orders are marked paid only when Mezout confirms the payment on Mezo.
- Unpaid orders are cancelled when their payment link expires.
- Refunds start from the WooCommerce order screen.

> **Testnet only.** Mezout runs on Mezo testnet. Payments use test tokens with no value.

## Before you start

- **WordPress 6.5 or newer**, **PHP 8.1 or newer** and WooCommerce.
- **Store currency: US Dollar (USD) or Mezo USD (MUSD).** The plugin adds MUSD to the currency list.
- **A public https address** for your store, so Mezout can tell it when an order is paid.

## Set it up

### 1. Get an API key

Open the [dashboard](/dashboard) and sign up with a passkey or your Mezo wallet. Set your business name, then go to **Developers** and click **Create API key**.

### 2. Get the plugin zip

The plugin isn't in the WordPress plugin directory yet. Build the zip from the Mezout source code, in the `plugins/woocommerce` folder:

```bash
pnpm zip
```

It writes `dist/mezout-woocommerce-<version>.zip`.

### 3. Install it

In WordPress, go to **Plugins → Add New → Upload Plugin**. Choose the zip, then click **Install** and **Activate**.

### 4. Turn it on

Go to **WooCommerce → Settings → Payments → Mezout**. Tick **Enable**, paste your API key and save.

The plugin checks the key and sets up payment updates for your store. There's nothing else to copy.

### 5. Take a test payment

Add a product to your cart and check out with Mezout. Pay with a Mezo testnet wallet. Get test tokens from [faucet.test.mezo.org](https://faucet.test.mezo.org).

After paying, the customer comes back to your order page. It says the payment is being confirmed, then updates once it is.

## Questions

### When is an order marked paid?

When Mezout's signed confirmation arrives and the amount matches the order total. This usually takes a few seconds after the customer pays. If the amount doesn't match, the order is put **on hold** for you to check.

### What happens to an order nobody pays?

It stays **Pending payment** until its payment link expires. That's 60 minutes by default; change it under **Payment link lifetime**. Then the order is cancelled and any held stock is released.

### Why does a refund take two steps?

Mezout never holds your funds, so it can't send money for you. Refunding from WooCommerce creates a refund request. You send the MUSD from the dashboard's **Payments** tab. If you decline the request there, the WooCommerce refund is removed.

Refunds you send straight from the dashboard are recorded in WooCommerce too.
