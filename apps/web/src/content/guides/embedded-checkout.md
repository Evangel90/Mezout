Keep customers on your site. Embedded checkout opens Mezout's checkout in a pop-up over your page. When they've paid, your page can update straight away.

You need a server that creates payment links with the [API](/docs#create-an-invoice). Each link has a `checkout_url`. That's what you open in the pop-up.

## Set it up

### 1. Approve your site

In the [dashboard](/dashboard/developers), go to **Developers → Embedded checkout sites** and add your site's address, for example `https://shop.example.com`. Checkout only opens inside sites on this list. You can add up to 10.

### 2. Add the script and a button

Load the script, then add a button with a payment link's `checkout_url`:

```html
<script src="https://usemezout.vercel.app/mezout.js"></script>
<button data-mezout-checkout="CHECKOUT_URL">Pay with Mezout</button>
```

Clicking the button opens checkout in a pop-up. Some wallets can't run inside a pop-up, so it also offers **Open in new window**.

### 3. Use your own controls (optional)

Call `Mezout.open` from your own code:

```js
Mezout.open({
  checkoutUrl,
  onPaid: () => showThankYou(),
  onClose: () => console.log("Closed"),
});
```

### 4. React sites (optional)

The `@mezout/embed-react` component does the same in React:

```tsx
<MezoutCheckout
  checkoutUrl={invoice.checkout_url}
  open={open}
  onClose={() => setOpen(false)}
  onPaid={() => setPaid(true)}
/>
```

It isn't published to npm yet; it's in the Mezout source code under `packages/embed-react`.

## Fulfil from your server, not the pop-up

`onPaid` is for updating your page, for example to show a thank-you message. Browser messages can be faked, so don't ship an order because of it.

Fulfil orders when the signed [`invoice.paid` webhook](/docs#webhooks) arrives, or after checking the invoice from your server with [`GET /v1/invoices/:id`](/docs#retrieve-and-list-invoices).
