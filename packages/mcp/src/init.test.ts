import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { claudeDesktopConfigPath, mergeCodexToml, mergeHermesYaml, mergeJsonConfig, registerClient, type Ctx, type Exec } from "./clients";
import { loadSettings } from "./config";
import { runDoctor } from "./doctor";
import { runInit, type InitIO } from "./init";
import { readSettingsFile, resolveSettings, writeSettingsFile } from "./settings";
import { bundledSkillDir, installSkill } from "./skills";
import pkg from "../package.json";
import { SERVER_VERSION } from "./server";

const POSIX = process.platform !== "win32";
const API_KEY = "mzk_test_AbCdEf0123456789abcdefghijklmnop";
const ENTRY = { command: "npx", args: ["-y", "@mezout/mcp"] };

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mezout-mcp-test-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

/** A fake `claude`/`codex` CLI: records calls; `installed` lists the CLIs on PATH. */
function fakeExec(installed: string[] = [], opts: { claudeHas?: boolean; codexHas?: boolean } = {}) {
  const calls: string[][] = [];
  const exec: Exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (!installed.includes(cmd)) return { status: null, output: "", missing: true };
    if (args[0] === "--version") return { status: 0, output: "1.0.0", missing: false };
    if (cmd === "claude" && args[1] === "add") {
      return opts.claudeHas ? { status: 1, output: "MCP server mezout already exists in user config", missing: false } : { status: 0, output: "Added", missing: false };
    }
    if (cmd === "codex" && args[1] === "get") return { status: opts.codexHas ? 0 : 1, output: "", missing: false };
    if (cmd === "codex" && args[1] === "add") return { status: 0, output: "Added global MCP server 'mezout'.", missing: false };
    return { status: 1, output: "unexpected", missing: false };
  };
  return { exec, calls };
}

const ctxFor = (exec: Exec = fakeExec().exec, platform: NodeJS.Platform = "linux"): Ctx => ({ home, env: { HOME: home }, platform, exec, now: () => new Date("2026-11-11T12:00:00Z") });

function io(extra: Partial<InitIO> = {}) {
  let out = "";
  let err = "";
  const value: InitIO = {
    out: (s) => void (out += s),
    err: (s) => void (err += s),
    env: { HOME: home },
    home,
    platform: "linux",
    exec: fakeExec().exec,
    now: () => new Date("2026-11-11T12:00:00Z"),
    ...extra,
  };
  return { io: value, output: () => out + err };
}

describe("settings file", () => {
  it("is written 0600 in a 0700 directory, and read back", () => {
    const path = join(home, ".mezout", "mcp.json");
    writeSettingsFile(path, { MEZOUT_API_KEY: API_KEY, MEZOUT_MAX_PAYMENT_MUSD: "2" });
    if (POSIX) {
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(join(home, ".mezout")).mode & 0o777).toBe(0o700);
    }
    expect(readSettingsFile(path)).toMatchObject({ found: true, insecure: false, settings: { MEZOUT_API_KEY: API_KEY, MEZOUT_MAX_PAYMENT_MUSD: "2" } });
  });

  it("lets environment variables override the file", () => {
    const path = join(home, "custom.json");
    writeSettingsFile(path, { MEZOUT_API_KEY: API_KEY, MEZOUT_MAX_PAYMENT_MUSD: "2", MEZOUT_MAX_SESSION_MUSD: "4" });
    const r = resolveSettings({ MEZOUT_CONFIG: path, MEZOUT_MAX_PAYMENT_MUSD: "3", MEZOUT_API_KEY: "" }, path);
    expect(r.values).toEqual({ MEZOUT_API_KEY: API_KEY, MEZOUT_MAX_PAYMENT_MUSD: "3", MEZOUT_MAX_SESSION_MUSD: "4" });
    expect(r.sources).toEqual({ MEZOUT_API_KEY: "file", MEZOUT_MAX_PAYMENT_MUSD: "env", MEZOUT_MAX_SESSION_MUSD: "file" });
    expect(loadSettings({ MEZOUT_CONFIG: path }).config).toMatchObject({ apiKey: API_KEY, maxPerPayment: "2", maxPerSession: "4" });
  });

  it("keeps the server's checks, names the file, and never echoes a bad key", () => {
    const path = join(home, "mcp.json");
    writeFileSync(path, JSON.stringify({ MEZOUT_PAYER_PRIVATE_KEY: "0xnotakeysecretvalue" }));
    expect(() => loadSettings({}, path)).toThrow(/MEZOUT_PAYER_PRIVATE_KEY.*in .*mcp\.json/);
    try {
      loadSettings({}, path);
    } catch (e) {
      expect(String(e)).not.toContain("secretvalue");
    }
    writeFileSync(path, JSON.stringify({ MEZOUT_API_KEY: "mzk_live_x" }));
    expect(() => loadSettings({}, path)).toThrow(/testnet/);
    expect(() => loadSettings({ MEZOUT_CHAIN_ID: "1" }, join(home, "none.json"))).toThrow(/31611/);
    writeFileSync(path, "{ not json mzk_test_secret");
    expect(() => loadSettings({}, path)).toThrow(/not valid JSON/);
    try {
      loadSettings({}, path);
    } catch (e) {
      expect(String(e)).not.toContain("mzk_test_secret");
    }
  });

  it.skipIf(!POSIX)("flags a file other users can read", () => {
    const path = join(home, "mcp.json");
    writeSettingsFile(path, {});
    chmodSync(path, 0o644);
    expect(readSettingsFile(path).insecure).toBe(true);
  });
});

describe("JSON config merge (Claude Desktop, Cursor)", () => {
  it("creates, merges next to other servers, and leaves an existing entry", () => {
    expect(mergeJsonConfig("", ENTRY)).toEqual({ kind: "write", text: `${JSON.stringify({ mcpServers: { mezout: ENTRY } }, null, 2)}\n` });
    const other = JSON.stringify({ theme: "dark", mcpServers: { github: { command: "gh" } } }, null, 4);
    const merged = mergeJsonConfig(other, ENTRY);
    expect(merged.kind).toBe("write");
    const text = (merged as { text: string }).text;
    expect(JSON.parse(text)).toEqual({ theme: "dark", mcpServers: { github: { command: "gh" }, mezout: ENTRY } });
    expect(text).toContain('\n    "theme"'); // keeps the 4-space indent
    expect(mergeJsonConfig(JSON.stringify({ mcpServers: { mezout: { command: "node" } } }), ENTRY)).toEqual({ kind: "already" });
  });

  it("refuses malformed files", () => {
    expect(mergeJsonConfig("{ // comment\n}", ENTRY).kind).toBe("error");
    expect(mergeJsonConfig("[]", ENTRY).kind).toBe("error");
    expect(mergeJsonConfig('{"mcpServers": []}', ENTRY).kind).toBe("error");
  });

  it("writes a backup, keeps other servers, and doesn't touch a malformed file", () => {
    const ctx = ctxFor(undefined, "darwin");
    const path = claudeDesktopConfigPath(ctx);
    expect(path).toBe(join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"));
    mkdirSync(join(path, ".."), { recursive: true });
    const original = JSON.stringify({ mcpServers: { other: { command: "x" } }, globalShortcut: "Ctrl+Space" });
    writeFileSync(path, original);
    const r = registerClient("claude-desktop", ctx);
    expect(r).toMatchObject({ status: "added", backup: `${path}.20261111-120000.bak` });
    expect(readFileSync(r.backup!, "utf8")).toBe(original);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ mcpServers: { other: { command: "x" }, mezout: ENTRY }, globalShortcut: "Ctrl+Space" });
    expect(registerClient("claude-desktop", ctx).status).toBe("already");

    const cursor = join(home, ".cursor", "mcp.json");
    mkdirSync(join(home, ".cursor"));
    writeFileSync(cursor, "{ broken");
    const bad = registerClient("cursor", ctx);
    expect(bad.status).toBe("manual");
    expect(bad.manual).toContain('"mezout"');
    expect(readFileSync(cursor, "utf8")).toBe("{ broken");
    expect(readdirSync(join(home, ".cursor"))).toEqual(["mcp.json"]);
  });

  it("uses the Windows and Linux Claude Desktop paths", () => {
    expect(claudeDesktopConfigPath({ ...ctxFor(), platform: "win32", env: { APPDATA: "C:\\Users\\a\\AppData\\Roaming" } })).toContain(join("C:\\Users\\a\\AppData\\Roaming", "Claude", "claude_desktop_config.json"));
    expect(claudeDesktopConfigPath(ctxFor())).toBe(join(home, ".config", "Claude", "claude_desktop_config.json"));
  });
});

describe("Codex config.toml", () => {
  const block = '[mcp_servers.mezout]\ncommand = "npx"\nargs = ["-y", "@mezout/mcp"]\n';

  it("appends one table and leaves the rest byte for byte", () => {
    expect(mergeCodexToml("")).toEqual({ kind: "write", text: block });
    const existing = 'model = "gpt-5"\n# my servers\n[mcp_servers.github]\ncommand = "gh"\n\n[mcp_servers.github.env]\nTOKEN = "t"\n';
    const r = mergeCodexToml(existing) as { kind: "write"; text: string };
    expect(r.text.startsWith(existing)).toBe(true);
    expect(parseToml(r.text)).toEqual({ model: "gpt-5", mcp_servers: { github: { command: "gh", env: { TOKEN: "t" } }, mezout: ENTRY } });
    expect(mergeCodexToml('model = "x"').kind).toBe("write");
  });

  it("leaves an existing entry and malformed or inline tables alone", () => {
    expect(mergeCodexToml(block).kind).toBe("already");
    expect(mergeCodexToml('[mcp_servers]\nmezout = { command = "node" }\n').kind).toBe("already");
    expect(mergeCodexToml("[mcp_servers\n").kind).toBe("error");
    expect(mergeCodexToml('mcp_servers = { github = { command = "gh" } }\n').kind).toBe("error");
  });

  it("uses `codex mcp add` when the CLI exists, but never over an existing entry", () => {
    const fresh = fakeExec(["codex"]);
    expect(registerClient("codex", ctxFor(fresh.exec))).toMatchObject({ status: "added" });
    expect(fresh.calls).toContainEqual(["codex", "mcp", "add", "mezout", "--", "npx", "-y", "@mezout/mcp"]);
    const taken = fakeExec(["codex"], { codexHas: true });
    expect(registerClient("codex", ctxFor(taken.exec))).toMatchObject({ status: "already" });
    expect(taken.calls.some((c) => c[2] === "add")).toBe(false);
  });

  it("edits the file when there is no CLI", () => {
    const path = join(home, ".codex", "config.toml");
    mkdirSync(join(home, ".codex"));
    writeFileSync(path, 'model = "gpt-5"\n');
    expect(registerClient("codex", ctxFor())).toMatchObject({ status: "added", backup: `${path}.20261111-120000.bak` });
    expect(readFileSync(path, "utf8")).toBe(`model = "gpt-5"\n\n${block}`);
  });
});

describe("Hermes config.yaml", () => {
  it("adds under mcp_servers, keeping comments and other servers", () => {
    const r = mergeHermesYaml("") as { text: string };
    expect(parseYaml(r.text)).toEqual({ mcp_servers: { mezout: ENTRY } });

    const existing = "model: hermes-4 # main model\nmcp_servers:\n    # GitHub\n    github:\n        command: gh\ntoolsets: [web]\n";
    const merged = mergeHermesYaml(existing) as { kind: string; text: string };
    expect(merged.kind).toBe("write");
    expect(parseYaml(merged.text)).toEqual({ model: "hermes-4", mcp_servers: { mezout: ENTRY, github: { command: "gh" } }, toolsets: ["web"] });
    expect(merged.text).toContain("# main model");
    expect(merged.text).toContain("    # GitHub");

    const noServers = mergeHermesYaml("model: x\n") as { text: string };
    expect(parseYaml(noServers.text)).toEqual({ model: "x", mcp_servers: { mezout: ENTRY } });
    const emptyKey = mergeHermesYaml("mcp_servers:\nmodel: x\n") as { text: string };
    expect(parseYaml(emptyKey.text)).toEqual({ model: "x", mcp_servers: { mezout: ENTRY } });
  });

  it("leaves an existing entry, malformed files and flow mappings alone", () => {
    expect(mergeHermesYaml("mcp_servers:\n  mezout:\n    command: node\n").kind).toBe("already");
    expect(mergeHermesYaml("mcp_servers: [\n").kind).toBe("error");
    expect(mergeHermesYaml("mcp_servers: {github: {command: gh}}\n").kind).toBe("error");
    expect(mergeHermesYaml("- a\n- b\n").kind).toBe("error");
  });
});

describe("Claude Code", () => {
  it("runs `claude mcp add --scope user` and reports an existing entry without changing it", () => {
    const fresh = fakeExec(["claude"]);
    expect(registerClient("claude-code", ctxFor(fresh.exec)).status).toBe("added");
    expect(fresh.calls).toContainEqual(["claude", "mcp", "add", "--scope", "user", "mezout", "--", "npx", "-y", "@mezout/mcp"]);
    expect(registerClient("claude-code", ctxFor(fakeExec(["claude"], { claudeHas: true }).exec)).status).toBe("already");
    expect(registerClient("claude-code", ctxFor()).status).toBe("manual");
  });
});

describe("agent skill", () => {
  it("ships with the package and installs without clobbering", () => {
    const source = bundledSkillDir();
    expect(source).toBeTruthy();
    const skill = readFileSync(join(source!, "SKILL.md"), "utf8");
    expect(skill).toMatch(/^---\nname: mezout\ndescription: .+/);
    expect(skill.split("\n").length).toBeLessThan(200);

    const ctx = ctxFor();
    expect(installSkill("claude-code", source!, ctx)).toMatchObject({ status: "installed" });
    expect(existsSync(join(home, ".claude", "skills", "mezout", "references", "api.md"))).toBe(true);
    expect(installSkill("claude-code", source!, ctx).status).toBe("already");
    writeFileSync(join(home, ".claude", "skills", "mezout", "SKILL.md"), "edited");
    const updated = installSkill("claude-code", source!, ctx);
    expect(updated.status).toBe("updated");
    expect(readFileSync(join(updated.backup!, "SKILL.md"), "utf8")).toBe("edited");
    expect(updated.backup!.startsWith(join(home, ".mezout", "backups"))).toBe(true);
    expect(installSkill("codex", source!, ctx).detail).toContain(join(home, ".agents", "skills", "mezout"));
    expect(installSkill("claude-desktop", source!, ctx).status).toBe("skipped");
  });

  it.skipIf(!POSIX)("leaves a symlinked skill (from `npx skills`) alone", () => {
    mkdirSync(join(home, ".cursor", "skills"), { recursive: true });
    symlinkSync(bundledSkillDir()!, join(home, ".cursor", "skills", "mezout"));
    expect(installSkill("cursor", bundledSkillDir()!, ctxFor()).status).toBe("skipped");
  });
});

describe("init, non-interactive", () => {
  it("saves keys, registers detected clients, installs the skill, and prints no key", async () => {
    const payerKey = generatePrivateKey();
    const keyFile = join(home, "payer.key");
    writeFileSync(keyFile, `${payerKey}\n`);
    mkdirSync(join(home, ".cursor"));
    mkdirSync(join(home, ".hermes"));
    writeFileSync(join(home, ".hermes", "config.yaml"), "model: x\n");
    const claude = fakeExec(["claude"]);
    const { io: base, output } = io({ exec: claude.exec });
    const code = await runInit(["--yes", "--api-key", API_KEY, "--payer-key-file", keyFile, "--max-payment", "0.5", "--max-session", "2"], base);
    expect(code).toBe(0);
    const out = output();
    expect(out).not.toContain(API_KEY);
    expect(out).not.toContain(payerKey.slice(2));
    expect(out).toContain(privateKeyToAccount(payerKey).address);

    const saved = JSON.parse(readFileSync(join(home, ".mezout", "mcp.json"), "utf8"));
    expect(saved).toEqual({ MEZOUT_API_KEY: API_KEY, MEZOUT_PAYER_PRIVATE_KEY: payerKey, MEZOUT_MAX_PAYMENT_MUSD: "0.5", MEZOUT_MAX_SESSION_MUSD: "2" });
    if (POSIX) expect(statSync(join(home, ".mezout", "mcp.json")).mode & 0o777).toBe(0o600);

    // No keys in any client config.
    const cursor = readFileSync(join(home, ".cursor", "mcp.json"), "utf8");
    expect(JSON.parse(cursor)).toEqual({ mcpServers: { mezout: { type: "stdio", ...ENTRY } } });
    const hermes = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(parseYaml(hermes)).toEqual({ model: "x", mcp_servers: { mezout: ENTRY } });
    for (const text of [cursor, hermes, ...claude.calls.map((c) => c.join(" "))]) {
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain(payerKey.slice(2));
    }
    expect(claude.calls).toContainEqual(["claude", "mcp", "add", "--scope", "user", "mezout", "--", "npx", "-y", "@mezout/mcp"]);
    for (const dir of [".claude/skills", ".cursor/skills", ".hermes/skills"]) expect(existsSync(join(home, dir, "mezout", "SKILL.md"))).toBe(true);
    expect(out).toContain("Create a Mezout invoice for 0.5 MUSD");

    // Running it again changes nothing and keeps the saved keys.
    const again = io({ exec: fakeExec(["claude"], { claudeHas: true }).exec });
    expect(await runInit(["--yes"], again.io)).toBe(0);
    expect(JSON.parse(readFileSync(join(home, ".mezout", "mcp.json"), "utf8"))).toEqual(saved);
    expect(readFileSync(join(home, ".cursor", "mcp.json"), "utf8")).toBe(cursor);
    expect(again.output()).not.toContain(payerKey.slice(2));
  });

  it("reads keys from the environment and stdin, honours MEZOUT_CONFIG and --client", async () => {
    const payerKey = generatePrivateKey();
    const custom = join(home, "elsewhere", "mezout.json");
    mkdirSync(join(home, ".cursor"));
    const { io: base, output } = io({ env: { HOME: home, MEZOUT_CONFIG: custom, MEZOUT_API_KEY: API_KEY }, readStdin: async () => payerKey });
    expect(await runInit(["--payer-key-file", "-", "--client", "none"], base)).toBe(0);
    expect(JSON.parse(readFileSync(custom, "utf8"))).toMatchObject({ MEZOUT_API_KEY: API_KEY, MEZOUT_PAYER_PRIVATE_KEY: payerKey });
    expect(existsSync(join(home, ".cursor", "mcp.json"))).toBe(false);
    expect(output()).not.toContain(payerKey.slice(2));
  });

  it("rejects bad keys and caps without echoing them, and saves nothing", async () => {
    const bad = io();
    expect(await runInit(["--api-key", "mzk_live_SECRETSECRET"], bad.io)).toBe(1);
    expect(bad.output()).not.toContain("SECRETSECRET");
    const keyFile = join(home, "k");
    writeFileSync(keyFile, "0xdeadbeefSECRET");
    const badPayer = io();
    expect(await runInit(["--payer-key-file", keyFile], badPayer.io)).toBe(1);
    expect(badPayer.output()).not.toContain("deadbeef");
    const caps = io();
    expect(await runInit(["--max-payment", "5", "--max-session", "1"], caps.io)).toBe(1);
    expect(caps.output()).toMatch(/at least/);
    expect(await runInit(["--client", "vim"], io().io)).toBe(1);
    expect(existsSync(join(home, ".mezout"))).toBe(false);
  });
});

describe("init, interactive", () => {
  it("asks for keys with hidden input, re-asks bad ones, and asks per client", async () => {
    const payerKey = generatePrivateKey();
    mkdirSync(join(home, ".cursor"));
    const answers = ["mzk_live_nope", API_KEY, payerKey, "", "3", "y", "n"];
    const asked: Array<{ q: string; hidden: boolean }> = [];
    const { io: base, output } = io({
      ask: async (q, opts) => {
        asked.push({ q, hidden: !!opts?.hidden });
        return answers.shift() ?? "";
      },
    });
    expect(await runInit([], base)).toBe(0);
    expect(asked.filter((a) => a.hidden)).toHaveLength(3);
    expect(asked.find((a) => /Add Mezout to Cursor/.test(a.q))).toBeTruthy();
    expect(JSON.parse(readFileSync(join(home, ".mezout", "mcp.json"), "utf8"))).toEqual({
      MEZOUT_API_KEY: API_KEY,
      MEZOUT_PAYER_PRIVATE_KEY: payerKey,
      MEZOUT_MAX_PAYMENT_MUSD: "1",
      MEZOUT_MAX_SESSION_MUSD: "3",
    });
    expect(existsSync(join(home, ".cursor", "mcp.json"))).toBe(true);
    expect(existsSync(join(home, ".cursor", "skills", "mezout"))).toBe(false);
    const out = output();
    expect(out).toMatch(/test-only|only for testing/);
    expect(out).not.toContain(API_KEY);
    expect(out).not.toContain(payerKey.slice(2));
  });
});

describe("doctor", () => {
  it("checks chain, balance and key without printing secrets", async () => {
    const payerKey = generatePrivateKey();
    writeSettingsFile(join(home, ".mezout", "mcp.json"), { MEZOUT_API_KEY: API_KEY, MEZOUT_PAYER_PRIVATE_KEY: payerKey });
    const seen: string[] = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push(String(url));
      if (String(url).includes("/v1/invoices")) {
        const auth = new Headers(init?.headers).get("authorization");
        return Response.json({ object: "list", data: [] }, { status: auth === `Bearer ${API_KEY}` ? 200 : 401 });
      }
      const { method } = JSON.parse(String(init?.body));
      const result = method === "eth_chainId" ? "0x7b7b" : `0x${(5n * 10n ** 18n).toString(16).padStart(64, "0")}`;
      return Response.json({ jsonrpc: "2.0", id: 1, result });
    }) as typeof fetch;
    let out = "";
    const code = await runDoctor({ out: (s) => void (out += s), env: { HOME: home }, home, platform: "linux", fetch: fake, exec: fakeExec().exec });
    expect(code).toBe(0);
    expect(out).toContain("RPC chain 31611");
    expect(out).toContain("payer holds 5 MUSD");
    expect(out).toContain("API key accepted");
    expect(out).toContain(privateKeyToAccount(payerKey).address);
    expect(out).not.toContain(API_KEY);
    expect(out).not.toContain(payerKey.slice(2));
  });

  it("fails on the wrong chain", async () => {
    const fake = (async () => Response.json({ jsonrpc: "2.0", id: 1, result: "0x1" })) as unknown as typeof fetch;
    let out = "";
    expect(await runDoctor({ out: (s) => void (out += s), env: { HOME: home }, home, platform: "linux", fetch: fake, exec: fakeExec().exec })).toBe(1);
    expect(out).toMatch(/FAIL.*chain 1/);
  });
});

it("reports the package version", () => {
  expect(SERVER_VERSION).toBe(pkg.version);
});
