AI agents can buy things too. Mezout lets them pay you in MUSD, from code, with the same guarantees as your human customers. You get paid the same way either way.

## Three ways to use it

### Get paid by agents per request

Put a price on an API route. An agent that calls it without paying gets told the price. It pays, retries, and gets the answer. This is the **paywall**; see [Charge per request](/guides/paywall).

### Let your agent run your Mezout account

Give your own AI assistant your Mezout API key and it can work for you:

- create payment links for an exact amount;
- check whether a link has been paid, and list your payment links;
- request refunds (you still send them from the dashboard);
- check whether a payment went through.

### Let your agent pay

Give an agent a test wallet and it can pay Mezout payment links and paywalls in MUSD, with no gas and no wallet pop-ups. You set a limit per payment and per session.

## How it connects: the MCP server

MCP (Model Context Protocol) is the standard AI agents use to call tools. Mezout's MCP server gives your agent the tools above.

It works with any agent that can run a local MCP server, including **Claude**, **Codex**, **Cursor** and **Hermes Agent**. Agents that only connect to servers hosted on the internet can't use it yet: it runs on your computer so that the wallet key never leaves it.

**[Set up the MCP server in the docs →](/docs#ai-agents)** It takes one command or a few lines of settings for each agent.

## Building with a coding agent? Add the Mezout skill

If you use a coding agent such as **Claude Code**, **Codex**, **Cursor** or **Hermes Agent** to write your integration, give it the Mezout skill first. It's a short guide your agent reads when you work on Mezout code, so it knows how to create payment links, check webhook signatures, add the paywall and use the MCP server without guessing.

Install it once for every agent on your computer:

```bash
npx skills add Evangel90/Mezout --skill mezout -g
```

- **For one project only:** run the same command without `-g` inside the project.
- **Hermes Agent:** `hermes skills install Evangel90/Mezout/skills/mezout`.
- **Already setting up the MCP server?** `npx -y @mezout/mcp init` offers to install the skill too.

Then ask your agent something like "Add Mezout checkout to my order page". The skill's text is on [GitHub](https://github.com/Evangel90/Mezout/tree/main/skills/mezout).

## What you need

- **To take payments:** your Mezout API key. Open the [dashboard](/dashboard), go to **Developers** and click **Create API key**.
- **To make payments:** a new wallet used only for testing, with test BTC and MUSD from [faucet.test.mezo.org](https://faucet.test.mezo.org). Never use a wallet that holds real funds.

## Built-in limits

- **Spending caps.** By default, 1 MUSD per payment and 10 MUSD until the server restarts. You can change both.
- **Mezout only.** The agent pays only on Mezo, only through Mezout's own contracts.
- **Your key stays put.** The wallet's private key never leaves your computer. Each payment sends two signatures, and only to Mezout.
- **No double payments.** Expired and already-paid links are refused, and so are payments the wallet can't cover.
