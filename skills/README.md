# Agent skills

[`mezout/`](mezout) is an [Agent Skill](https://agentskills.io): a `SKILL.md` with the essentials of the Mezout API and `references/` for invoices and refunds, webhooks, the HTTP 402 paywall and the MCP server. Agents load it when you work on a Mezout integration.

Install it for every agent on your machine (Claude Code, Codex, Cursor, Hermes Agent and others):

```bash
npx skills add Evangel90/Mezout --skill mezout -g
```

Or for one project (run in the project): `npx skills add Evangel90/Mezout --skill mezout`. Hermes Agent: `hermes skills install Evangel90/Mezout/skills/mezout`. `npx -y @mezout/mcp init` also offers to install it, since the npm package ships a copy.

Keep it in step with `docs/API.md`: the skill restates the API, so change both together. `pnpm --filter @mezout/mcp test` checks the frontmatter and length.
