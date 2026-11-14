# @mezout/embed-react

Open a [Mezout](https://usemezout.vercel.app) checkout in a modal on your React site. Customers pay with MUSD, BTC or MEZO, or borrow against their Bitcoin; you receive MUSD. Mezo testnet.

```bash
npm install @mezout/embed-react
```

## Before you start

1. Create payment links on your server with the [Mezout API](https://usemezout.vercel.app/docs#create-an-invoice). Each link has a `checkout_url`.
2. In the [dashboard](https://usemezout.vercel.app/dashboard/developers), add your site's origin (for example `https://shop.example.com`) under **Developers → Embedded checkout sites**. Checkout only opens inside approved sites.

## Use it

```tsx
import { useState } from "react";
import { MezoutCheckout } from "@mezout/embed-react";

export function PayButton({ checkoutUrl }: { checkoutUrl: string }) {
  const [open, setOpen] = useState(false);
  const [paid, setPaid] = useState(false);
  if (paid) return <p>Thanks, your payment is complete.</p>;
  return (
    <>
      <button onClick={() => setOpen(true)}>Pay with Mezout</button>
      <MezoutCheckout checkoutUrl={checkoutUrl} open={open} onClose={() => setOpen(false)} onPaid={() => setPaid(true)} />
    </>
  );
}
```

| Prop | Description |
| --- | --- |
| `checkoutUrl` | The invoice's `checkout_url`. Required. |
| `open` | Shows the modal while `true`. Required. |
| `onClose` | Called when the customer closes the modal or checkout. Required. |
| `onPaid` | Called with `{ orderId, txHash }` when checkout reports a payment. |
| `title` | The modal's title. Default `"Complete payment"`. |

Some wallets can't run inside an iframe, so the modal also offers **Open in new window**. The component ships with `"use client"`, so Next.js App Router pages can import it directly.

## Fulfil orders from your server

`onPaid` is for updating your page. Browser messages can be forged, so don't ship an order because of it: fulfil from the signed [`invoice.paid` webhook](https://usemezout.vercel.app/docs#webhooks) or check the invoice with `GET /v1/invoices/:id`.

Not using React? Load `https://usemezout.vercel.app/mezout.js` instead; see the [embedded checkout guide](https://usemezout.vercel.app/guides/embedded-checkout).

## License

MIT
