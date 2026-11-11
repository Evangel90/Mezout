# Mezout MCP server

Lets MCP-capable agents (Claude, Cursor and others) take and make payments with Mezout on Mezo testnet (chain 31611). It runs over stdio.

| Tool | Needs | What it does |
| --- | --- | --- |
| `create_invoice` | `MEZOUT_API_KEY` | `POST /v1/invoices`: an exact MUSD amount, returns the `checkout_url` |
| `get_invoice` | `MEZOUT_API_KEY` | `GET /v1/invoices/:id`: status and payment |
| `list_invoices` | `MEZOUT_API_KEY` | `GET /v1/invoices`, newest first, paged with `starting_after` |
| `refund` | `MEZOUT_API_KEY` | `POST /v1/refunds`: a pending refund the merchant sends from the dashboard |
| `verify_payment` | `MEZOUT_API_KEY` | `POST /v1/verify`: is this invoice paid (by this transaction)? |
| `pay_invoice` | `MEZOUT_PAYER_PRIVATE_KEY` | Pays a `checkout_url` in MUSD, gasless through Mezout's relay |
| `fetch_paid_resource` | `MEZOUT_PAYER_PRIVATE_KEY` | Fetches a URL and pays an HTTP 402 Mezout paywall on the way ([`@mezout/paywall`](../paywall)) |
| `get_budget` | `MEZOUT_PAYER_PRIVATE_KEY` | Payer address, MUSD spent and left under the limits |

`create_invoice` and `refund` send an `Idempotency-Key`: pass `idempotency_key` to retry safely, or a random one is used.

## How paying works

`pay_invoice` does what the checkout's **Pay with MUSD** does, with the SDK's typed data: it signs the EIP-712 `Payment` for the link's router and an MUSD permit for exactly the invoice amount, then posts both to `MEZOUT_API_URL/api/relay`, which submits `payWithMUSD` and pays the gas. The key stays on your machine; only those two signatures leave it, and only to Mezout's relay.

Before signing it refuses:

- any chain other than 31611 (checked on the RPC) and any `MEZOUT_CHAIN_ID` other than 31611;
- links that name a router other than Mezout's deployed v1, v2 or v3 (the permit's spender is that router);
- expired or already-paid invoices, and a balance that is too low;
- amounts over `MEZOUT_MAX_PAYMENT_MUSD`, over the call's `max_amount`, or that would take the total past `MEZOUT_MAX_SESSION_MUSD`. The session total lives as long as the server process.

Tool results and logs never contain the private key or signatures.

## Settings

| Variable | Default | |
| --- | --- | --- |
| `MEZOUT_API_URL` | `https://usemezout.vercel.app` | Mezout app (API and relay). `http://localhost:3000` for local dev. |
| `MEZOUT_API_KEY` | none | Merchant key, `mzk_test_…`, from the dashboard's **Developers** tab |
| `MEZOUT_PAYER_PRIVATE_KEY` | none | Paying wallet's key (hex). Use a testnet-only wallet holding test MUSD. |
| `MEZOUT_MAX_PAYMENT_MUSD` | `1` | Largest single payment |
| `MEZOUT_MAX_SESSION_MUSD` | `10` | Total per server process |
| `MEZO_RPC_URL` | `https://rpc.test.mezo.org` | Mezo testnet RPC |

Names are in `.env.example`.

## Run it

Build once, in a terminal at the repository root:

```bash
pnpm install
pnpm --filter @mezout/mcp build     # writes packages/mcp/dist/index.js
```

Add it to Claude Code (any terminal, replace the path and values):

```bash
claude mcp add mezout \
  -e MEZOUT_API_KEY=mzk_test_YOUR_KEY \
  -e MEZOUT_PAYER_PRIVATE_KEY=0xYOUR_TESTNET_KEY \
  -e MEZOUT_MAX_PAYMENT_MUSD=1 -e MEZOUT_MAX_SESSION_MUSD=5 \
  -- node /absolute/path/to/Mezout/packages/mcp/dist/index.js
```

Or in a client's JSON config (Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "mezout": {
      "command": "node",
      "args": ["/absolute/path/to/Mezout/packages/mcp/dist/index.js"],
      "env": { "MEZOUT_API_KEY": "mzk_test_…", "MEZOUT_PAYER_PRIVATE_KEY": "0x…", "MEZOUT_MAX_PAYMENT_MUSD": "1" }
    }
  }
}
```

`npx /absolute/path/to/Mezout/packages/mcp` also starts it, once `dist/` is built. The server prints one status line to stderr (payer address and limits, never the key).

## Develop

In a terminal at the repository root:

```bash
pnpm --filter @mezout/mcp test        # Vitest: in-memory MCP client, fake Mezout API, relay and chain
pnpm --filter @mezout/mcp typecheck
```
