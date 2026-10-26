// A minimal Mezout webhook receiver: verifies the signature, ignores duplicates, and fulfils paid orders.
// No dependencies; Node 18 or later.
//
// Run in a terminal, inside the Mezout/examples/webhook-receiver folder:
//   MEZOUT_WEBHOOK_SECRET=whsec_... node server.mjs
// It listens on http://localhost:4242/webhooks/mezout (PORT changes the port). Mezout's production site only
// delivers to public https URLs, so expose it with a tunnel (for example `cloudflared tunnel --url localhost:4242`)
// and add the tunnel's https URL as an endpoint in the dashboard, under Developers.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

/**
 * Checks a Mezout-Signature header ("t=<unix seconds>,v1=<hex>") against the raw request body.
 * v1 is HMAC-SHA256 of "<t>.<raw body>" keyed with the endpoint's signing secret. Reject old timestamps so a
 * captured request cannot be replayed later.
 */
export function verifyMezoutSignature(rawBody, header, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const parts = Object.fromEntries(
    String(header ?? "")
      .split(",")
      .map((p) => p.split("=", 2)),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || typeof parts.v1 !== "string") return false;
  if (Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return parts.v1.length === expected.length && timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}

// Event ids already handled. Use your database in production, so a retry after a restart is still ignored.
const seen = new Set();

async function handle(event) {
  const object = event.data.object;
  switch (event.type) {
    case "invoice.paid":
      // Safe to fulfil: Mezout sends this only after the payment is on-chain. Match the invoice by object.id (or by
      // object.reference, your own order number) and check object.amount against what you charged.
      console.log(`fulfil ${object.reference ?? object.id}: ${object.amount} MUSD paid by ${object.payment.payer}`);
      break;
    case "invoice.expired":
      console.log(`release stock for ${object.reference ?? object.id}: the link expired unpaid`);
      break;
    case "refund.completed":
      console.log(`refund ${object.id}: ${object.amount} MUSD returned for invoice ${object.invoice?.id}`);
      break;
    case "ping":
      console.log("test event from the dashboard");
      break;
    default:
      // New event types may be added; ignore ones you do not handle.
      break;
  }
}

function start({ secret, port }) {
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/webhooks/mezout") return res.writeHead(404).end();
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      // Verify the exact bytes received, before parsing them.
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!verifyMezoutSignature(raw, req.headers["mezout-signature"], secret)) return res.writeHead(400).end("bad signature");
      const event = JSON.parse(raw);
      if (seen.has(event.id)) return res.writeHead(200).end("duplicate");
      try {
        await handle(event);
        seen.add(event.id);
        res.writeHead(200).end("ok");
      } catch (err) {
        // Any non-2xx answer makes Mezout retry later.
        console.error(err);
        res.writeHead(500).end();
      }
    });
  });
  server.listen(port, () => console.log(`listening on http://localhost:${port}/webhooks/mezout`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.env.MEZOUT_WEBHOOK_SECRET;
  if (!secret) throw new Error("Set MEZOUT_WEBHOOK_SECRET to the endpoint's signing secret (whsec_...)");
  start({ secret, port: Number(process.env.PORT ?? 4242) });
}
