#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "./config";
import { createMezoutServer } from "./server";

// stdout carries the MCP protocol; diagnostics go to stderr, and never include keys or signatures.
async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    console.error(`mezout-mcp: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const server = createMezoutServer(config);
  await server.connect(new StdioServerTransport());
  const roles = [
    config.apiKey ? "merchant tools on" : "merchant tools off (no MEZOUT_API_KEY)",
    config.payerKey
      ? `paying as ${privateKeyToAccount(config.payerKey).address}, max ${config.maxPerPayment} MUSD per payment, ${config.maxPerSession} per session`
      : "paying off (no MEZOUT_PAYER_PRIVATE_KEY)",
  ];
  console.error(`mezout-mcp: Mezo testnet via ${config.apiUrl}; ${roles.join("; ")}`);
}

main().catch((err) => {
  console.error(`mezout-mcp: ${err instanceof Error ? err.message : "failed to start"}`);
  process.exit(1);
});
