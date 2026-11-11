#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { privateKeyToAccount } from "viem/accounts";
import { loadSettings } from "./config";
import { runDoctor } from "./doctor";
import { runInit } from "./init";
import { terminalPrompter } from "./prompt";
import { createMezoutServer, SERVER_VERSION } from "./server";
import { homeDir } from "./settings";

const HELP = `mezout-mcp ${SERVER_VERSION}: Mezout's MCP server for AI agents (Mezo testnet)

Usage:
  npx -y @mezout/mcp            Start the MCP server on stdio (what your MCP client runs)
  npx -y @mezout/mcp init       Save your keys and add the server to Claude, Cursor, Codex, Hermes
  npx -y @mezout/mcp doctor     Check the saved settings, the network and the API key
  npx -y @mezout/mcp --version

Settings come from environment variables first, then ~/.mezout/mcp.json (or $MEZOUT_CONFIG).
Guide: https://usemezout.vercel.app/docs#ai-agents
`;

// stdout carries the MCP protocol; diagnostics go to stderr, and never include keys or signatures.
async function serve() {
  let loaded;
  try {
    loaded = loadSettings(process.env);
  } catch (err) {
    console.error(`mezout-mcp: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const { config, resolved } = loaded;
  if (resolved.file.insecure) console.error(`mezout-mcp: warning: ${resolved.file.path} is readable by other users; run chmod 600 on it`);
  const server = createMezoutServer(config);
  await server.connect(new StdioServerTransport());
  const roles = [
    config.apiKey ? "merchant tools on" : "merchant tools off (no API key)",
    config.payerKey
      ? `paying as ${privateKeyToAccount(config.payerKey).address}, max ${config.maxPerPayment} MUSD per payment, ${config.maxPerSession} per session`
      : "paying off (no payer key)",
  ];
  const from = resolved.file.found ? `; settings from ${resolved.file.path} and env` : "";
  console.error(`mezout-mcp: Mezo testnet via ${config.apiUrl}; ${roles.join("; ")}${from}`);
}

async function main(argv: string[]): Promise<number | undefined> {
  const [cmd, ...rest] = argv;
  const out = (s: string) => void process.stdout.write(s);
  const err = (s: string) => void process.stderr.write(s);
  const io = { out, env: process.env, home: homeDir(process.env), platform: process.platform };
  switch (cmd) {
    case undefined:
      await serve();
      return undefined;
    case "init": {
      const prompter = process.stdin.isTTY ? terminalPrompter() : undefined;
      try {
        return await runInit(rest, {
          ...io,
          err,
          ask: prompter?.ask,
          readStdin: async () => {
            let s = "";
            for await (const chunk of process.stdin) s += chunk;
            return s;
          },
        });
      } finally {
        prompter?.close();
      }
    }
    case "doctor":
      return runDoctor(io);
    case "-h":
    case "--help":
    case "help":
      out(HELP);
      return 0;
    case "-v":
    case "--version":
      out(`${SERVER_VERSION}\n`);
      return 0;
    default:
      // Echo the word only if it looks like a command, never something that could be a pasted key.
      err(`mezout-mcp: unknown command${/^[a-z-]{1,20}$/.test(cmd) ? ` "${cmd}"` : ""}\n\n${HELP}`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code !== undefined) process.exitCode = code;
  },
  (err) => {
    console.error(`mezout-mcp: ${err instanceof Error ? err.message : "failed to start"}`);
    process.exit(1);
  },
);
