# Mezout MCP server

Lets MCP-capable agents (Claude, Codex, Cursor, Hermes Agent and others) take and make payments with Mezout on Mezo testnet (chain 31611). It runs over stdio.

## Quick start

You need Node.js 20 or later. In any terminal:

```bash
npx -y @mezout/mcp init
```

It asks for your keys (hidden input) and spending limits, saves them to `~/.mezout/mcp.json` (mode 600), adds `npx -y @mezout/mcp` to the MCP clients it finds (Claude Code, Claude Desktop, Cursor, Codex, Hermes Agent) with no keys in their configs, and can install the [Mezout agent skill](https://github.com/Evangel90/Mezout/tree/main/skills/mezout). Restart your agent and ask: *Create a Mezout invoice for 0.5 MUSD for "Test order", then pay it and tell me the transaction.*

- **API key** (merchant tools): `mzk_test_…` from the dashboard's **Developers** tab.
- **Payer key** (paying tools): a new wallet used only for testing, funded with test BTC and MUSD from [faucet.test.mezo.org](https://faucet.test.mezo.org).

| Command | Does |
| --- | --- |
| `npx -y @mezout/mcp` | Starts the server on stdio (what MCP clients run) |
| `npx -y @mezout/mcp init` | Saves keys, registers with clients, installs the skill. `--help` lists the flags for scripts: `--yes`, `--api-key`, `--payer-key-file`, `--max-payment`, `--max-session`, `--client`, `--skill`, `--config` |
| `npx -y @mezout/mcp doctor` | Checks the saved settings, the RPC chain, the payer's MUSD balance and the API key, printing no secrets |
| `npx -y @mezout/mcp --version` | Prints the version |

When `init` edits a client's config file (Claude Desktop, Cursor, Codex without its CLI, Hermes Agent) it parses it, adds only `mezout`, writes a timestamped `.bak` first, and leaves a file it can't parse untouched, printing what to add by hand. For Claude Code and Codex it uses `claude mcp add --scope user` and `codex mcp add`, never replacing an existing `mezout` entry. Manual setup per client: [usemezout.vercel.app/docs#ai-agents](https://usemezout.vercel.app/docs#ai-agents).

## Tools

| Tool | Needs | What it does |
| --- | --- | --- |
| `create_invoice` | API key | `POST /v1/invoices`: an exact MUSD amount, returns the `checkout_url` |
| `get_invoice` | API key | `GET /v1/invoices/:id`: status and payment |
| `list_invoices` | API key | `GET /v1/invoices`, newest first, paged with `starting_after` |
| `refund` | API key | `POST /v1/refunds`: a pending refund the merchant sends from the dashboard |
| `verify_payment` | API key | `POST /v1/verify`: is this invoice paid (by this transaction)? |
| `pay_invoice` | payer key | Pays a `checkout_url` in MUSD, gasless through Mezout's relay |
| `fetch_paid_resource` | payer key | Fetches a URL and pays an HTTP 402 Mezout paywall on the way ([`@mezout/paywall`](../paywall)) |
| `get_budget` | payer key | Payer address, MUSD spent and left under the limits |

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

The server reads environment variables first, then `~/.mezout/mcp.json` (written by `init`; `MEZOUT_CONFIG` names another file), which uses the same names:

| Name | Default | |
| --- | --- | --- |
| `MEZOUT_API_URL` | `https://usemezout.vercel.app` | Mezout app (API and relay). `http://localhost:3000` for local dev. |
| `MEZOUT_API_KEY` | none | Merchant key, `mzk_test_…`, from the dashboard's **Developers** tab |
| `MEZOUT_PAYER_PRIVATE_KEY` | none | Paying wallet's key (hex). Use a testnet-only wallet holding test MUSD. |
| `MEZOUT_MAX_PAYMENT_MUSD` | `1` | Largest single payment |
| `MEZOUT_MAX_SESSION_MUSD` | `10` | Total per server process |
| `MEZO_RPC_URL` | `https://rpc.test.mezo.org` | Mezo testnet RPC |

Passing keys as environment variables still works (for CI, or `claude mcp add -e …`, or an `env` block in a client config); they override the file. The server prints one status line to stderr (payer address, limits and the settings file, never a key) and warns if the file is readable by other users.

## Develop

To run it from source, build it with `pnpm --filter @mezout/mcp build` (this also copies `skills/mezout` into `dist/skills`) and point your client at `node packages/mcp/dist/index.js`.

In a terminal at the repository root:

```bash
pnpm --filter @mezout/mcp test        # Vitest: MCP tools against a fake Mezout; init, config merges and skill install in a temp HOME
pnpm --filter @mezout/mcp typecheck
```
