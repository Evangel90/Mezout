Your customers check out as usual and pick **Pay with Bitcoin or MUSD (Mezout)**. The thank-you page then shows a **Complete payment** button. They pay with Bitcoin, MUSD or MEZO, or borrow MUSD against their BTC. You get the order total in MUSD, less Mezout's fee, and the order is marked **Paid** automatically.

## Before you start

> **Not on the Shopify App Store yet.** Today you run the Mezout app yourself with the Shopify CLI, on a free Shopify development store. Mezout runs on Mezo testnet, so payments use test tokens with no value.

- **Store currency: US dollar (USD).** Customers pay 1 MUSD per dollar. Orders in any other currency get no payment link.
- **New customer accounts** for the button on the order status page. They're the default for new stores.
- **A free Shopify Partner account**, from [partners.shopify.com](https://partners.shopify.com).
- **A Mezout API key.** Open the [dashboard](/dashboard), go to **Developers** and click **Create API key**.
- **Node.js 22.12 or newer** and **pnpm 9** on your computer.
- **The Mezout source code.** The app lives in the `plugins/shopify` folder.

## How it works

Shopify only lets approved payment partners add card-style gateways. So Mezout adds a manual payment method, and payment happens right after checkout:

1. The customer places the order with **Pay with Bitcoin or MUSD (Mezout)**.
2. The app creates one Mezout payment link for the order.
3. The thank-you page shows **Complete payment**. The customer pays on Mezout's checkout.
4. Once the payment is confirmed on Mezo, Mezout tells the app and the order becomes **Paid**.

The order is marked paid only when Mezout's signed confirmation arrives and the amount matches. A customer returning to your store proves nothing.

## Set it up

### 1. Create a development store

In the [Shopify Partner Dashboard](https://partners.shopify.com), go to **Stores → Add store → Create development store**. Keep the currency as **US dollar (USD)** under **Settings → General → Store currency**.

### 2. Install and start the app

In a terminal, in the `plugins/shopify` folder:

```bash
pnpm install
pnpm dev
```

The Shopify CLI asks you to log in, to **create a new app** (call it "Mezout") and to pick your development store. Leave it running. Press `p` to open the app, then install it on your store when Shopify asks.

### 3. Allow what the app needs

In the Partner Dashboard, open **Apps → Mezout → API access**:

- **Protected customer data:** request it with the reason "Store management". Leave Name, Email, Phone and Address unticked. Development stores get access without a review.
- **Network access in checkout and account UI extensions:** request it on the same page. The **Complete payment** button needs it.

Restart `pnpm dev` afterwards.

### 4. Connect Mezout

On the Mezout settings page in your Shopify admin, paste your API key (`mzk_test_…`) and click **Save**. It says **Connected** and sets up payment updates for you.

To check, click **Send test event** on the Mezout dashboard's **Developers** tab.

### 5. Add the payment method

In Shopify, go to **Settings → Payments → Manual payment methods → Create custom payment method**.

- **Name:** `Pay with Bitcoin or MUSD (Mezout)`. Any name with "Mezout" in it works.
- **Additional details:** for example, "After placing your order, click Complete payment on the next page to pay with Bitcoin, MUSD or MEZO."

Activate it.

### 6. Add the Complete payment button

Publish the button once, in the `plugins/shopify` folder:

```bash
pnpm exec shopify app deploy --allow-updates
```

Then go to **Settings → Checkout → Customize**. Choose the **Thank you** page, click **Add app block**, pick **Mezout payment button** and save. Do the same for the **Order status** page.

### 7. Place a test order

Open your store, add a product and check out with **Pay with Bitcoin or MUSD (Mezout)**. Within seconds:

- the thank-you page shows **Complete payment**;
- the order is **Payment pending**, tagged `mezout-awaiting-payment`.

Click **Complete payment** and pay with a Mezo testnet wallet. Get test tokens from [faucet.test.mezo.org](https://faucet.test.mezo.org). Once Mezo confirms it, the order becomes **Paid** and is tagged `mezout-paid`.

## Your orders

The app keeps a timestamped history in each order's **Notes** and tags the order:

| Tag | What it means |
| --- | --- |
| `mezout-awaiting-payment` | Waiting for the customer to pay. |
| `mezout-paid` | Paid. The note links to the transaction. |
| `mezout-unpaid` | The payment link expired. The order isn't cancelled: you decide. |
| `mezout-unsupported-currency` | Not in US dollars, so no payment link. |
| `mezout-amount-mismatch` | The order changed after its link was made. It isn't marked paid. |
| `mezout-error` | No API key, or Mezout refused the request. The note says why. |

No Mezout tag at all? The payment method's name didn't match.

## Refunds

Refund the order in Shopify as usual (**Refund → Refund manually**). This creates a refund request in Mezout. Mezout never holds your money, so you send the refund yourself from the dashboard's **Payments** tab. The order note updates once it's sent.

## Good to know

- **Expired links aren't renewed.** You can create a new payment link in the dashboard and send it, but paying it won't mark the order paid automatically.
- **Refunds sent straight from the dashboard** add a note, but aren't recorded as Shopify refunds.
- **Running it for real merchants** needs a host with a Postgres database and, for the App Store, Shopify's review.
