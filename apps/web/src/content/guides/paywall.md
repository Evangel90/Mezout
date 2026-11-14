Charge AI agents for each call to your API, in MUSD. `@mezout/paywall` wraps an API route: unpaid requests get a price, paid ones get the answer. You set the price; Mezout checks every payment.


## How a paid request works

1. An agent calls your route without paying.
2. Your API answers **402 Payment Required**, with a Mezout payment link for your price.
3. The agent pays the link in MUSD. Mezout pays the gas.
4. The agent calls again, with proof of payment.
5. Your server asks Mezout whether that payment is real and matches this route and price. If so, it serves the request.

Each payment buys one request. A payment can't be reused.

## Set it up

### 1. Get an API key

Open the [dashboard](/dashboard), go to **Developers** and click **Create API key**. Keep it on your server, for example as `MEZOUT_API_KEY`.

### 2. Install the package

```bash
npm install @mezout/paywall
```

It runs on Node 20 or later. `viem` is its only dependency.

### 3. Wrap a route

**Next.js (App Router):**

```ts
// app/api/report/route.ts
import { withMezout402 } from "@mezout/paywall/next";

export const GET = withMezout402({ apiKey: process.env.MEZOUT_API_KEY!, price: "0.05" }, async (req, ctx, payment) =>
  Response.json({ report, paidBy: payment.payer }),
);
```

**Express:**

```ts
import { mezout402 } from "@mezout/paywall/express";

app.get("/report", mezout402({ apiKey: process.env.MEZOUT_API_KEY!, price: "0.05" }), (req, res) => {
  res.json({ report, paidBy: req.mezout!.payer });
});
```

Here each call to `/report` costs 0.05 MUSD.

### 4. Pick your options

| Option | What it does |
| --- | --- |
| `apiKey` | Your Mezout API key. Required. |
| `price` | The price in MUSD, like `"0.05"`. Can also be a function of the request. |
| `description` | What the agent is paying for. |
| `expiresIn` | How long each payment link lasts, in seconds. Default 600. |
| `store` | Where used payments are remembered. See below. |

### 5. Running more than one server?

By default each server remembers used payments in memory. With more than one server, pass a shared `store` with a `consume(id)` function that returns `true` only the first time it sees an id. For example, Redis `SET NX` or an insert into a unique database column.

## Test it

Ask an agent with the [Mezout MCP server](/guides/ai-agents) to fetch your route. Its `fetch_paid_resource` tool pays the paywall and returns the answer. The payment shows up on your dashboard.

## About the format

The paywall speaks [x402](https://github.com/x402-foundation/x402/tree/main/specs), an open format for paying over HTTP 402, with its own `mezout` payment scheme. Mezout pays merchants through its contract against a signed invoice, so it can't use x402's standard `exact` scheme. Agents that only support `exact` see an offer they can't take; nothing breaks. The [API reference](/docs#charge-agents-per-request) has the details.
