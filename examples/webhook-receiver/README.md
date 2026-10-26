# Mezout webhook receiver

A minimal receiver for Mezout webhooks in one file, `server.mjs`, with no dependencies (Node 18 or later). It:

- verifies the `Mezout-Signature` header against the raw body and rejects requests older than 5 minutes,
- ignores events it has already handled (by event `id`),
- logs what a store would do for `invoice.paid`, `invoice.expired`, `refund.completed` and `ping`.

`verifyMezoutSignature` is exported, so you can import it into your own server.

## Run it

1. Mezout delivers only to public `https` URLs, so give the receiver one with a tunnel. In a terminal, in any folder:

   ```bash
   cloudflared tunnel --url http://localhost:4242
   ```

2. In the Mezout dashboard, on the **Developers** tab, add the tunnel's URL followed by `/webhooks/mezout` as a webhook endpoint, and copy its signing secret.

3. In a second terminal, in this folder (`examples/webhook-receiver`), replacing the secret:

   ```bash
   MEZOUT_WEBHOOK_SECRET=whsec_YOUR_SECRET node server.mjs
   ```

4. Click **Send test event** on the dashboard. The receiver logs `test event from the dashboard`.

`PORT` changes the port (default 4242). The full guide is in the [API reference](https://usemezout.vercel.app/docs#webhooks).

## Before production

- Keep processed event ids in your database, not in memory, so a retry after a restart is still ignored.
- Answer within 10 seconds. If fulfilment is slow, store the event, answer `200`, and do the work afterwards.
- Check that `data.object.amount` matches the order before fulfilling it.
