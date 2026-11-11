import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";

/**
 * Registers `npx -y @mezout/mcp` with MCP clients, with no keys in their configs (the server reads ~/.mezout/mcp.json).
 *
 * Formats, checked against each client's docs in November 2026:
 * - Claude Code: `claude mcp add [--scope user] <name> -- <command> [args...]`; a second add with the same name fails
 *   with "already exists" and changes nothing. https://code.claude.com/docs/en/mcp
 * - Claude Desktop: `mcpServers` in claude_desktop_config.json, under ~/Library/Application Support/Claude (macOS),
 *   %APPDATA%\Claude (Windows), ~/.config/Claude (Linux). https://modelcontextprotocol.io/docs/develop/connect-local-servers
 * - Cursor: `mcpServers` in ~/.cursor/mcp.json, with `"type": "stdio"`. https://cursor.com/docs/context/mcp
 * - Codex: `codex mcp add <name> -- <command>`, or a `[mcp_servers.<name>]` table (`command`, `args`) in
 *   ~/.codex/config.toml ($CODEX_HOME). `codex mcp add` replaces an existing entry silently, so `codex mcp get` runs
 *   first (tested with codex-cli 0.167). https://learn.chatgpt.com/docs/extend/mcp?surface=cli
 * - Hermes Agent: `mcp_servers.<name>` (`command`, `args`) in ~/.hermes/config.yaml, then `/reload-mcp`.
 *   https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
 */

export const SERVER_NAME = "mezout";
export const SERVER_COMMAND = "npx";
export const SERVER_ARGS = ["-y", "@mezout/mcp"];

export const CLIENT_IDS = ["claude-code", "claude-desktop", "cursor", "codex", "hermes"] as const;
export type ClientId = (typeof CLIENT_IDS)[number];

export const CLIENT_NAMES: Record<ClientId, string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  codex: "Codex",
  hermes: "Hermes Agent",
};

export type ExecResult = { status: number | null; output: string; missing: boolean };
export type Exec = (cmd: string, args: string[]) => ExecResult;

export const realExec: Exec = (cmd, args) => {
  // Windows CLIs installed by npm are .cmd shims, which only a shell can start. Arguments here never hold keys.
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
  const missing = (r.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT" || (process.platform === "win32" && r.status === 1 && /not recognized/i.test(r.stderr ?? ""));
  return { status: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}`, missing };
};

export type Ctx = { home: string; env: Record<string, string | undefined>; platform: NodeJS.Platform; exec: Exec; now?: () => Date };

export type Outcome = {
  client: ClientId;
  status: "added" | "already" | "manual" | "failed";
  /** One line for the summary. */
  detail: string;
  file?: string;
  backup?: string;
  /** What to do by hand when the config can't be changed safely. */
  manual?: string;
};

const has = (ctx: Ctx, cmd: string) => {
  const r = ctx.exec(cmd, ["--version"]);
  return !r.missing && r.status === 0;
};

export function claudeDesktopConfigPath(ctx: Ctx): string {
  if (ctx.platform === "darwin") return join(ctx.home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (ctx.platform === "win32") return join(ctx.env.APPDATA || join(ctx.home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return join(ctx.env.XDG_CONFIG_HOME || join(ctx.home, ".config"), "Claude", "claude_desktop_config.json");
}
export const cursorConfigPath = (ctx: Ctx) => join(ctx.home, ".cursor", "mcp.json");
export const codexHome = (ctx: Ctx) => ctx.env.CODEX_HOME || join(ctx.home, ".codex");
export const hermesHome = (ctx: Ctx) => ctx.env.HERMES_HOME || join(ctx.home, ".hermes");
const claudeCodeUserConfig = (ctx: Ctx) => join(ctx.home, ".claude.json");

/** Whether each client looks installed: its CLI is on PATH or its config directory exists. */
export function detectClients(ctx: Ctx): ClientId[] {
  const found: ClientId[] = [];
  if (has(ctx, "claude") || existsSync(join(ctx.home, ".claude"))) found.push("claude-code");
  if (existsSync(dirname(claudeDesktopConfigPath(ctx)))) found.push("claude-desktop");
  if (existsSync(join(ctx.home, ".cursor"))) found.push("cursor");
  if (has(ctx, "codex") || existsSync(codexHome(ctx))) found.push("codex");
  if (has(ctx, "hermes") || existsSync(hermesHome(ctx))) found.push("hermes");
  return found;
}

// ---------- the exact entries, for the files and for manual instructions ----------

const jsonEntry = (client: ClientId) =>
  client === "cursor" ? { type: "stdio", command: SERVER_COMMAND, args: SERVER_ARGS } : { command: SERVER_COMMAND, args: SERVER_ARGS };

const jsonSnippet = (client: ClientId) => JSON.stringify({ mcpServers: { [SERVER_NAME]: jsonEntry(client) } }, null, 2);

const TOML_BLOCK = `[mcp_servers.${SERVER_NAME}]\ncommand = "${SERVER_COMMAND}"\nargs = ["-y", "@mezout/mcp"]\n`;
const yamlServer = (indent: string) => `${indent}${SERVER_NAME}:\n${indent}${indent}command: "${SERVER_COMMAND}"\n${indent}${indent}args: ["-y", "@mezout/mcp"]\n`;
const YAML_BLOCK = `mcp_servers:\n${yamlServer("  ")}`;

export function manualInstructions(client: ClientId, ctx: Ctx): string {
  switch (client) {
    case "claude-code":
      return "Run: claude mcp add --scope user mezout -- npx -y @mezout/mcp";
    case "claude-desktop":
      return `Add to ${claudeDesktopConfigPath(ctx)} (Settings > Developer > Edit Config):\n${jsonSnippet(client)}`;
    case "cursor":
      return `Add to ${cursorConfigPath(ctx)}:\n${jsonSnippet(client)}`;
    case "codex":
      return `Run: codex mcp add mezout -- npx -y @mezout/mcp\nor add to ${join(codexHome(ctx), "config.toml")}:\n${TOML_BLOCK}`;
    case "hermes":
      return `Add under mcp_servers in ${join(hermesHome(ctx), "config.yaml")}, then run /reload-mcp:\n${YAML_BLOCK}`;
  }
}

// ---------- safe file edits ----------

type Edit = { kind: "already" } | { kind: "error"; reason: string } | { kind: "write"; text: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

/**
 * Applies `edit` to a config file: never touches a file it can't parse, writes `<file>.<timestamp>.bak` before
 * changing an existing file, and replaces the file atomically with its mode kept.
 */
export function editConfigFile(client: ClientId, path: string, edit: (text: string) => Edit, ctx: Ctx): Outcome {
  const exists = existsSync(path);
  let text = "";
  try {
    if (exists) text = readFileSync(path, "utf8");
  } catch {
    return { client, status: "manual", detail: `couldn't read ${path}`, manual: manualInstructions(client, ctx) };
  }
  const result = edit(text);
  if (result.kind === "already") return { client, status: "already", detail: `already in ${path}; left as is`, file: path };
  if (result.kind === "error") {
    return { client, status: "manual", detail: `${path} left untouched: ${result.reason}`, manual: manualInstructions(client, ctx) };
  }
  try {
    let backup: string | undefined;
    let mode: number | undefined;
    if (exists) {
      backup = `${path}.${stamp(ctx.now?.() ?? new Date())}.bak`;
      copyFileSync(path, backup);
      mode = statSync(path).mode & 0o777;
    } else {
      mkdirSync(dirname(path), { recursive: true });
    }
    const tmp = `${path}.mezout-${process.pid}.tmp`;
    writeFileSync(tmp, result.text, mode === undefined ? {} : { mode });
    renameSync(tmp, path);
    return { client, status: "added", detail: exists ? `added to ${path}` : `created ${path}`, file: path, backup };
  } catch (err) {
    return { client, status: "failed", detail: `couldn't write ${path}: ${(err as Error).message}`, manual: manualInstructions(client, ctx) };
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Adds `mcpServers.mezout` to a JSON config, keeping every other key. */
export function mergeJsonConfig(text: string, entry: Record<string, unknown>): Edit {
  let doc: unknown = {};
  if (text.trim() !== "") {
    try {
      doc = JSON.parse(text);
    } catch {
      return { kind: "error", reason: "it isn't valid JSON (comments or trailing commas?)" };
    }
  }
  if (!isPlainObject(doc)) return { kind: "error", reason: "it isn't a JSON object" };
  const servers = doc.mcpServers ?? {};
  if (!isPlainObject(servers)) return { kind: "error", reason: "its mcpServers isn't an object" };
  if (SERVER_NAME in servers) return { kind: "already" };
  const next = { ...doc, mcpServers: { ...servers, [SERVER_NAME]: entry } };
  const indent = /^[ \t]*\{\s*\n([ \t]+)"/.exec(text)?.[1] ?? "  ";
  return { kind: "write", text: `${JSON.stringify(next, null, indent)}\n` };
}

/** Appends a `[mcp_servers.mezout]` table to Codex's config.toml, leaving the rest of the file byte for byte. */
export function mergeCodexToml(text: string): Edit {
  // Plain JSON copies, so comparisons ignore the parser's prototypes (dates become strings on both sides).
  const plain = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  let before: Record<string, unknown>;
  try {
    before = plain(parseToml(text));
  } catch {
    return { kind: "error", reason: "it isn't valid TOML" };
  }
  const servers = before.mcp_servers;
  if (servers !== undefined && !isPlainObject(servers)) return { kind: "error", reason: "its mcp_servers isn't a table" };
  if (servers && SERVER_NAME in servers) return { kind: "already" };
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const sep = text === "" ? "" : text.endsWith("\n") ? eol : eol + eol;
  const next = `${text}${sep}${TOML_BLOCK.replace(/\n/g, eol)}`;
  // Check the result says exactly what it said before, plus the one table (an inline mcp_servers table can't be extended).
  try {
    const after = plain(parseToml(next));
    const added = (after.mcp_servers as Record<string, unknown>)?.[SERVER_NAME];
    const rest = { ...after, mcp_servers: { ...(after.mcp_servers as object) } } as Record<string, any>;
    delete rest.mcp_servers[SERVER_NAME];
    if (servers === undefined && Object.keys(rest.mcp_servers).length === 0) delete rest.mcp_servers;
    if (!isDeepStrictEqual(added, { command: SERVER_COMMAND, args: SERVER_ARGS }) || !isDeepStrictEqual(rest, before)) throw new Error();
  } catch {
    return { kind: "error", reason: "the table can't be appended safely" };
  }
  return { kind: "write", text: next };
}

/**
 * Adds `mezout` under `mcp_servers` in Hermes's config.yaml by inserting lines (comments and layout stay), then
 * re-parses and checks that nothing else changed. Flow-style or unusual layouts get manual instructions instead.
 */
export function mergeHermesYaml(text: string): Edit {
  const doc = parseDocument(text);
  if (doc.errors.length) return { kind: "error", reason: "it isn't valid YAML" };
  const before = (doc.toJS() ?? {}) as unknown;
  if (!isPlainObject(before)) return { kind: "error", reason: "it isn't a YAML mapping" };
  const servers = before.mcp_servers;
  if (servers !== undefined && servers !== null && !isPlainObject(servers)) return { kind: "error", reason: "its mcp_servers isn't a mapping" };
  if (isPlainObject(servers) && SERVER_NAME in servers) return { kind: "already" };

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  let next: string;
  const header = lines.findIndex((l) => /^mcp_servers:\s*(#.*)?$/.test(l));
  if (servers === undefined) {
    const sep = text === "" ? "" : text.endsWith("\n") ? "" : eol;
    next = `${text}${sep}${YAML_BLOCK.replace(/\n/g, eol)}`;
  } else if (header >= 0) {
    // Indent like the existing children; two spaces when there are none.
    const child = lines.slice(header + 1).find((l) => l.trim() !== "" && !l.trim().startsWith("#"));
    const indent = child && /^( +)\S/.exec(child)?.[1] ? /^( +)/.exec(child)![1] : "  ";
    const insert = yamlServer(indent).trimEnd().split("\n");
    next = [...lines.slice(0, header + 1), ...insert, ...lines.slice(header + 1)].join(eol);
  } else {
    return { kind: "error", reason: "its mcp_servers isn't in a layout this tool edits" };
  }
  const check = parseDocument(next);
  const after = check.errors.length ? null : (check.toJS() as Record<string, any>);
  const expected = { ...before, mcp_servers: { ...(isPlainObject(servers) ? servers : {}), [SERVER_NAME]: { command: SERVER_COMMAND, args: SERVER_ARGS } } };
  if (!after || !isDeepStrictEqual(after, expected)) return { kind: "error", reason: "the entry can't be added safely" };
  return { kind: "write", text: next };
}

// ---------- registration per client ----------

/** Whether mezout is already registered, as far as can be read without starting anything. */
export function isRegistered(client: ClientId, ctx: Ctx): boolean {
  const readJson = (p: string) => {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as Record<string, any>;
    } catch {
      return null;
    }
  };
  switch (client) {
    case "claude-code":
      return !!readJson(claudeCodeUserConfig(ctx))?.mcpServers?.[SERVER_NAME];
    case "claude-desktop":
      return !!readJson(claudeDesktopConfigPath(ctx))?.mcpServers?.[SERVER_NAME];
    case "cursor":
      return !!readJson(cursorConfigPath(ctx))?.mcpServers?.[SERVER_NAME];
    case "codex":
      return mergeCodexToml(safeRead(join(codexHome(ctx), "config.toml"))).kind === "already";
    case "hermes":
      return mergeHermesYaml(safeRead(join(hermesHome(ctx), "config.yaml"))).kind === "already";
  }
}

const safeRead = (p: string) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

export function registerClient(client: ClientId, ctx: Ctx): Outcome {
  switch (client) {
    case "claude-code": {
      if (!has(ctx, "claude")) return { client, status: "manual", detail: "the claude CLI isn't on PATH", manual: manualInstructions(client, ctx) };
      const r = ctx.exec("claude", ["mcp", "add", "--scope", "user", SERVER_NAME, "--", SERVER_COMMAND, ...SERVER_ARGS]);
      if (r.status === 0) return { client, status: "added", detail: "added with `claude mcp add --scope user` (in ~/.claude.json)" };
      if (/already exists/i.test(r.output)) return { client, status: "already", detail: "already registered; left as is (`claude mcp get mezout` shows it)" };
      return { client, status: "failed", detail: `claude mcp add failed: ${firstLine(r.output)}`, manual: manualInstructions(client, ctx) };
    }
    case "claude-desktop":
      return editConfigFile(client, claudeDesktopConfigPath(ctx), (t) => mergeJsonConfig(t, jsonEntry(client)), ctx);
    case "cursor":
      return editConfigFile(client, cursorConfigPath(ctx), (t) => mergeJsonConfig(t, jsonEntry(client)), ctx);
    case "codex": {
      if (has(ctx, "codex")) {
        // `codex mcp add` would silently replace an existing entry (and its env), so look first.
        if (ctx.exec("codex", ["mcp", "get", SERVER_NAME]).status === 0) return { client, status: "already", detail: "already registered; left as is (`codex mcp get mezout` shows it)" };
        const r = ctx.exec("codex", ["mcp", "add", SERVER_NAME, "--", SERVER_COMMAND, ...SERVER_ARGS]);
        if (r.status === 0) return { client, status: "added", detail: "added with `codex mcp add`" };
        return { client, status: "failed", detail: `codex mcp add failed: ${firstLine(r.output)}`, manual: manualInstructions(client, ctx) };
      }
      return editConfigFile(client, join(codexHome(ctx), "config.toml"), mergeCodexToml, ctx);
    }
    case "hermes":
      return editConfigFile(client, join(hermesHome(ctx), "config.yaml"), mergeHermesYaml, ctx);
  }
}

const firstLine = (s: string) => s.trim().split(/\r?\n/)[0]?.slice(0, 200) || "no output";

/** What to do after registering, per client. */
export const RESTART_HINT: Record<ClientId, string> = {
  "claude-code": "start a new Claude Code session (or run /mcp)",
  "claude-desktop": "quit and reopen Claude Desktop",
  cursor: "restart Cursor (or toggle the server in Settings > MCP)",
  codex: "start a new Codex session",
  hermes: "run /reload-mcp in Hermes, or start a new session",
};
