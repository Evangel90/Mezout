# Mezout MCP server (`@mezout/mcp`)

A local stdio MCP server that lets an agent invoice and pay with Mezout on Mezo testnet. Needs Node.js 20+.

## Set up

```bash
npx -y @mezout/mcp init
```

It asks for the keys (hidden input), saves them to `~/.mezout/mcp.json` (mode 600; `MEZOUT_CONFIG` overrides the path), and adds `npx -y @mezout/mcp` to the MCP clients it finds (Claude Code, Claude Desktop, Cursor, Codex, Hermes Agent) with **no keys in their configs**. It can also install this skill. Then restart the client. `npx -y @mezout/mcp doctor` checks the settings, the RPC chain, the payer's MUSD balance and the API key without printing secrets.

Non-interactive (CI): `npx -y @mezout/mcp init --yes --api-key mzk_test_… --payer-key-file ./payer.key --max-payment 1 --max-session 10 --client claude-code,codex`.

Manual registration, no keys:

- Claude Code: `claude mcp add --scope user mezout -- npx -y @mezout/mcp`
- Codex: `codex mcp add mezout -- npx -y @mezout/mcp`
- Claude Desktop (`claude_desktop_config.json`) and Cursor (`~/.cursor/mcp.json`): `{"mcpServers": {"mezout": {"command": "npx", "args": ["-y", "@mezout/mcp"]}}}`
- Hermes Agent (`~/.hermes/config.yaml`): `mcp_servers: mezout: {command: npx, args: ["-y", "@mezout/mcp"]}`, then `/reload-mcp`

Never ask the user to paste a private key into the chat: point them to `init`, which reads it locally.

## Keys

- **API key** `mzk_test_…` (dashboard → Developers): enables the merchant tools.
- **Payer private key**: a **new, test-only wallet** funded at https://faucet.test.mezo.org; enables the paying tools. It never leaves the machine; each payment sends two signatures, only to Mezout's relay.

## Tools

| Tool | Needs | Arguments | Does |
| --- | --- | --- | --- |
| `create_invoice` | API key | `amount`, `reference?`, `success_url?`, `expires_in?` (300 to 2,592,000), `idempotency_key?` | `POST /v1/invoices`; returns the invoice with `checkout_url` |
| `get_invoice` | API key | `id` | Status and payment |
| `list_invoices` | API key | `limit?` (1 to 100), `starting_after?` | Newest first |
| `refund` | API key | `invoice`, `amount?`, `reason?`, `idempotency_key?` | Creates a **pending** refund the merchant sends from the dashboard |
| `verify_payment` | API key | `invoice`, `transaction?` | `POST /v1/verify` |
| `pay_invoice` | payer key | `checkout_url`, `max_amount?` | Pays in MUSD, gasless; returns `transaction` and an explorer link |
| `fetch_paid_resource` | payer key | `url`, `method?`, `headers?`, `body?` | Fetches a URL, paying a Mezout HTTP 402 paywall on the way |
| `get_budget` | payer key | none | Payer address, MUSD spent and remaining |

Pass `idempotency_key` when retrying `create_invoice` or `refund` so a retry can't create a second one.

## Limits the server enforces

- Mezo testnet (31611) only, checked on the RPC; only Mezout's own routers.
- `MEZOUT_MAX_PAYMENT_MUSD` per payment (default 1) and `MEZOUT_MAX_SESSION_MUSD` per server run (default 10); `max_amount` lowers it per call. Don't try to work around a refusal: tell the user which limit applied; they can raise it with `init` and restart.
- Refuses expired or already-paid invoices and balances that are too low.

## Settings

Environment variables override the saved file: `MEZOUT_API_KEY`, `MEZOUT_PAYER_PRIVATE_KEY`, `MEZOUT_MAX_PAYMENT_MUSD`, `MEZOUT_MAX_SESSION_MUSD`, `MEZOUT_API_URL` (default `https://usemezout.vercel.app`; `http` only for localhost), `MEZO_RPC_URL` (default `https://rpc.test.mezo.org`). Changes take effect when the client restarts the server.

## Typical flow

"Create a Mezout invoice for 0.5 MUSD for "Test order", then pay it and tell me the transaction." → `create_invoice {amount: "0.5", reference: "Test order"}` → `pay_invoice {checkout_url}` → report `transaction` and `explorerUrl`; `get_invoice` then shows `paid`.
