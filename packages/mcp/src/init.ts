import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CLIENT_IDS,
  CLIENT_NAMES,
  detectClients,
  isRegistered,
  realExec,
  registerClient,
  RESTART_HINT,
  type ClientId,
  type Ctx,
  type Exec,
  type Outcome,
} from "./clients";
import { DECIMAL, isTestApiKey, loadConfig, normalizePayerKey } from "./config";
import type { Ask } from "./prompt";
import { readSettingsFile, settingsPath, writeSettingsFile, type Env, type Settings } from "./settings";
import { bundledSkillDir, installSkill, skillDir, type SkillOutcome } from "./skills";

export const SAMPLE_PROMPT = 'Create a Mezout invoice for 0.5 MUSD for "Test order", then pay it and tell me the transaction.';
export const DOCS_URL = "https://usemezout.vercel.app/docs#ai-agents";

export const INIT_HELP = `Usage: npx -y @mezout/mcp init [options]

Saves your Mezout keys to a private file (~/.mezout/mcp.json, or $MEZOUT_CONFIG) and registers
\`npx -y @mezout/mcp\` with your MCP clients, with no keys in their configs. Asks for anything not given.

Options:
  --api-key <key>          Merchant API key (mzk_test_...). Or set MEZOUT_API_KEY.
  --payer-key-file <path>  File holding the payer wallet's private key ("-" reads stdin).
                           Or set MEZOUT_PAYER_PRIVATE_KEY. Use a test-only wallet.
  --max-payment <musd>     Largest single payment (default 1)
  --max-session <musd>     Most the agent may spend per server run (default 10)
  --api-url <url>          Mezout app URL (default https://usemezout.vercel.app)
  --client <list>          Clients to register: ${CLIENT_IDS.join(", ")}, all or none
  --skill / --no-skill     Install the Mezout agent skill into those clients' skills folders
  --config <path>          Settings file to write (default ~/.mezout/mcp.json)
  -y, --yes                Don't ask: register with every client found and install the skill
  -h, --help               Show this help
`;

export type InitIO = {
  out: (s: string) => void;
  err: (s: string) => void;
  env: Env;
  home: string;
  platform: NodeJS.Platform;
  exec?: Exec;
  /** Set when stdin is a terminal: questions are asked. */
  ask?: Ask;
  readStdin?: () => Promise<string>;
  now?: () => Date;
  /** Skill folder to install; defaults to the one bundled with the package. */
  skillSource?: string | null;
};

class InitError extends Error {}

const yesNo = async (ask: Ask, q: string, def = true) => {
  const a = (await ask(`${q} ${def ? "[Y/n]" : "[y/N]"} `)).toLowerCase();
  return a === "" ? def : a.startsWith("y");
};

/** `npx -y @mezout/mcp init`. Returns the exit code. Never prints keys: only "set" and the payer's public address. */
export async function runInit(argv: string[], io: InitIO): Promise<number> {
  try {
    return await init(argv, io);
  } catch (err) {
    io.err(`mezout-mcp init: ${err instanceof Error ? err.message : "failed"}\n`);
    return 1;
  }
}

async function init(argv: string[], io: InitIO): Promise<number> {
  const { values: flags } = parseArgs({
    args: argv,
    strict: true,
    options: {
      "api-key": { type: "string" },
      "payer-key-file": { type: "string" },
      "max-payment": { type: "string" },
      "max-session": { type: "string" },
      "api-url": { type: "string" },
      client: { type: "string" },
      skill: { type: "boolean" },
      "no-skill": { type: "boolean" },
      config: { type: "string" },
      yes: { type: "boolean", short: "y" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (flags.help) {
    io.out(INIT_HELP);
    return 0;
  }
  const ask = flags.yes ? undefined : io.ask;
  // Check the client list before saving anything.
  if (flags.client !== undefined) parseClients(flags.client, []);
  const say = (s = "") => io.out(`${s}\n`);
  const path = flags.config || settingsPath(io.env, io.home);
  const ctx: Ctx = { home: io.home, env: io.env, platform: io.platform, exec: io.exec ?? realExec, now: io.now };

  say("Mezout MCP setup (Mezo testnet only)");
  say(`Keys are saved to ${path}, readable only by you, never to your agents' configs.`);
  say();

  const existing = readSettingsFile(path);
  const next: Settings = { ...existing.settings };
  if (existing.found) say(`Found saved settings; press Enter to keep a value.\n`);

  // ---- merchant API key ----
  const apiKey = flags["api-key"] ?? io.env.MEZOUT_API_KEY;
  if (apiKey !== undefined && apiKey !== "") {
    if (!isTestApiKey(apiKey)) throw new InitError("the API key must be a Mezout testnet key starting with mzk_test_");
    next.MEZOUT_API_KEY = apiKey;
    say(`API key: taken from ${flags["api-key"] !== undefined ? "--api-key" : "MEZOUT_API_KEY"}.`);
  } else if (ask) {
    say("Merchant API key (optional): lets the agent create, list, check and refund your invoices.");
    say("Create one on the dashboard's Developers tab: https://usemezout.vercel.app/dashboard");
    next.MEZOUT_API_KEY = await askSecret(ask, "API key", next.MEZOUT_API_KEY, (v) => (isTestApiKey(v) ? v : null), "must start with mzk_test_", say);
    say();
  }

  // ---- payer key ----
  const payer = await readPayerKey(flags["payer-key-file"], io);
  if (payer) {
    next.MEZOUT_PAYER_PRIVATE_KEY = payer;
    say(`Payer key: taken from ${flags["payer-key-file"] !== undefined ? "--payer-key-file" : "MEZOUT_PAYER_PRIVATE_KEY"}.`);
  } else if (ask) {
    say("Payer private key (optional): lets the agent pay invoices and HTTP 402 paywalls in MUSD.");
    say("Use a NEW wallet used only for testing, never one with real funds. Fund it at https://faucet.test.mezo.org");
    next.MEZOUT_PAYER_PRIVATE_KEY = await askSecret(ask, "Private key (0x + 64 hex)", next.MEZOUT_PAYER_PRIVATE_KEY, normalizePayerKey, "must be 0x followed by 64 hex digits", say);
    say();
  }
  if (next.MEZOUT_PAYER_PRIVATE_KEY) say(`Paying wallet: ${privateKeyToAccount(next.MEZOUT_PAYER_PRIVATE_KEY as `0x${string}`).address}`);

  // ---- spending caps ----
  const decimal = (v: string | undefined, what: string) => {
    if (v !== undefined && !DECIMAL.test(v)) throw new InitError(`${what} must be a decimal MUSD amount such as 1 or 0.5`);
    return v;
  };
  next.MEZOUT_MAX_PAYMENT_MUSD = decimal(flags["max-payment"], "--max-payment") ?? next.MEZOUT_MAX_PAYMENT_MUSD;
  next.MEZOUT_MAX_SESSION_MUSD = decimal(flags["max-session"], "--max-session") ?? next.MEZOUT_MAX_SESSION_MUSD;
  if (ask && next.MEZOUT_PAYER_PRIVATE_KEY && flags["max-payment"] === undefined && flags["max-session"] === undefined) {
    say("Spending caps: the agent refuses any payment over the first, and stops once a run of the server has spent the second.");
    for (;;) {
      next.MEZOUT_MAX_PAYMENT_MUSD = await askAmount(ask, "Largest single payment, MUSD", next.MEZOUT_MAX_PAYMENT_MUSD ?? "1", say);
      next.MEZOUT_MAX_SESSION_MUSD = await askAmount(ask, "Most per session, MUSD", next.MEZOUT_MAX_SESSION_MUSD ?? "10", say);
      if (parseUnits(next.MEZOUT_MAX_SESSION_MUSD, 18) >= parseUnits(next.MEZOUT_MAX_PAYMENT_MUSD, 18)) break;
      say("The session cap must be at least the single-payment cap.");
    }
  }
  next.MEZOUT_MAX_PAYMENT_MUSD ??= "1";
  next.MEZOUT_MAX_SESSION_MUSD ??= "10";
  if (flags["api-url"]) next.MEZOUT_API_URL = flags["api-url"].replace(/\/+$/, "");

  // The server's own checks (testnet key, https, caps), so a saved file always starts.
  try {
    loadConfig(next);
  } catch (err) {
    throw new InitError((err as Error).message);
  }
  writeSettingsFile(path, next);
  say(`Saved ${path}${io.platform === "win32" ? "" : " (mode 600)"}.`);
  if (!next.MEZOUT_API_KEY && !next.MEZOUT_PAYER_PRIVATE_KEY) say("No keys saved yet: the server starts, but its tools will ask for keys. Run init again to add them.");
  say();

  // ---- MCP clients ----
  const detected = detectClients(ctx);
  let chosen: ClientId[];
  const registered = new Set(detected.filter((c) => isRegistered(c, ctx)));
  if (flags.client !== undefined) {
    chosen = parseClients(flags.client, detected);
  } else if (ask) {
    if (detected.length === 0) say(`No MCP clients found. To add Mezout by hand, see ${DOCS_URL}`);
    else say(`MCP clients found: ${detected.map((c) => CLIENT_NAMES[c]).join(", ")}`);
    chosen = [];
    for (const c of detected) {
      if (registered.has(c)) say(`${CLIENT_NAMES[c]}: Mezout is already registered.`);
      else if (await yesNo(ask, `Add Mezout to ${CLIENT_NAMES[c]}?`)) chosen.push(c);
    }
  } else {
    chosen = flags.yes ? detected.filter((c) => !registered.has(c)) : [];
  }
  const outcomes: Outcome[] = chosen.map((c) => registerClient(c, ctx));

  // ---- agent skill ----
  const skillTargets = [...new Set([...chosen, ...registered])].filter((c) => skillDir(c, ctx) !== null);
  const source = io.skillSource === undefined ? bundledSkillDir() : io.skillSource;
  let skills: SkillOutcome[] = [];
  if (skillTargets.length && source && !flags["no-skill"]) {
    const names = skillTargets.map((c) => CLIENT_NAMES[c]).join(", ");
    const want = flags.skill || (ask ? await yesNo(ask, `Install the Mezout agent skill (API reference for agents) for ${names}?`) : !!flags.yes);
    if (want) skills = skillTargets.map((c) => installSkill(c, source, ctx));
  }

  // ---- summary ----
  say();
  say("Summary");
  say(`  Settings: ${path}`);
  for (const o of outcomes) {
    say(`  ${CLIENT_NAMES[o.client]}: ${o.detail}`);
    if (o.backup) say(`    backup: ${o.backup}`);
  }
  for (const c of registered) if (!chosen.includes(c)) say(`  ${CLIENT_NAMES[c]}: already registered`);
  for (const s of skills) {
    say(`  Skill for ${CLIENT_NAMES[s.client]}: ${s.detail}`);
    if (s.backup) say(`    previous copy: ${s.backup}`);
  }
  const manual = outcomes.filter((o) => o.manual);
  if (manual.length) {
    say();
    say("Do by hand:");
    for (const o of manual) say(`  ${CLIENT_NAMES[o.client]}: ${o.manual!.trimEnd().replace(/\n/g, "\n    ")}`);
  }
  const ready = outcomes.filter((o) => o.status === "added").map((o) => o.client);
  say();
  say("Next:");
  if (ready.length) for (const c of ready) say(`  - ${CLIENT_NAMES[c]}: ${RESTART_HINT[c]}`);
  else if (!outcomes.length && !registered.size) say(`  - Add the server to your agent: ${DOCS_URL}`);
  say(`  - Ask your agent: ${SAMPLE_PROMPT}`);
  say("  - Check your setup any time: npx -y @mezout/mcp doctor");
  return 0;
}

function parseClients(list: string, detected: ClientId[]): ClientId[] {
  const parts = list.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (parts.includes("none")) return [];
  if (parts.includes("all")) return detected;
  const aliases: Record<string, ClientId> = { claude: "claude-code", "hermes-agent": "hermes" };
  return [
    ...new Set(
      parts.map((p) => {
        const id = (aliases[p] ?? p) as ClientId;
        if (!CLIENT_IDS.includes(id)) throw new InitError(`unknown client "${p}"; use ${CLIENT_IDS.join(", ")}, all or none`);
        return id;
      }),
    ),
  ];
}

async function readPayerKey(file: string | undefined, io: InitIO): Promise<string | undefined> {
  let raw: string | undefined;
  if (file === "-") raw = io.readStdin ? await io.readStdin() : undefined;
  else if (file) {
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      throw new InitError(`can't read ${file}`);
    }
  } else raw = io.env.MEZOUT_PAYER_PRIVATE_KEY || undefined;
  if (raw === undefined) return undefined;
  const key = normalizePayerKey(raw);
  if (!key) throw new InitError(`the payer key${file ? ` in ${file === "-" ? "stdin" : file}` : ""} must be 0x followed by 64 hex digits`);
  return key;
}

async function askSecret(
  ask: Ask,
  label: string,
  current: string | undefined,
  parse: (v: string) => string | null,
  rule: string,
  say: (s?: string) => void,
): Promise<string | undefined> {
  const hint = current ? "Enter keeps the saved one, - removes it" : "Enter to skip";
  for (let i = 0; i < 3; i++) {
    const a = await ask(`${label} (hidden; ${hint}): `, { hidden: true });
    if (a === "") return current;
    if (a === "-") return undefined;
    const v = parse(a);
    if (v) return v;
    say(`That doesn't look right: it ${rule}.`);
  }
  throw new InitError(`no valid ${label.toLowerCase()} given`);
}

async function askAmount(ask: Ask, label: string, def: string, say: (s?: string) => void): Promise<string> {
  for (;;) {
    const a = await ask(`${label} [${def}]: `);
    if (a === "") return def;
    if (DECIMAL.test(a)) return a;
    say("Enter a decimal amount such as 1 or 0.5.");
  }
}
