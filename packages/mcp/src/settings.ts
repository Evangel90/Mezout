import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** The settings the server reads, by their environment variable names. The saved file uses the same names. */
export const SETTING_KEYS = [
  "MEZOUT_API_KEY",
  "MEZOUT_PAYER_PRIVATE_KEY",
  "MEZOUT_MAX_PAYMENT_MUSD",
  "MEZOUT_MAX_SESSION_MUSD",
  "MEZOUT_API_URL",
  "MEZO_RPC_URL",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Partial<Record<SettingKey, string>>;
export type Env = Record<string, string | undefined>;

const POSIX = process.platform !== "win32";

/** The user's home directory; `HOME` (or `USERPROFILE`) first so tests and CI can point it elsewhere. */
export function homeDir(env: Env = process.env): string {
  return env.HOME || env.USERPROFILE || homedir();
}

/** `~/.mezout/mcp.json`, or `MEZOUT_CONFIG` when set. Outside any project, so keys never land in a repository. */
export function settingsPath(env: Env = process.env, home = homeDir(env)): string {
  return env.MEZOUT_CONFIG || join(home, ".mezout", "mcp.json");
}

export type SettingsFile = { path: string; found: boolean; settings: Settings; insecure: boolean };

/** Reads the saved settings. Throws on unreadable JSON without quoting the file (it holds keys). */
export function readSettingsFile(path: string): SettingsFile {
  if (!existsSync(path)) return { path, found: false, settings: {}, insecure: false };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${path} is not valid JSON. Fix it, or delete it and run \`npx -y @mezout/mcp init\` again.`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${path} must contain a JSON object`);
  const settings: Settings = {};
  for (const key of SETTING_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v !== "") settings[key] = v;
    else if (typeof v === "number") settings[key] = String(v);
  }
  // Group or world access to a file holding a private key.
  const insecure = POSIX && (statSync(path).mode & 0o077) !== 0;
  return { path, found: true, settings, insecure };
}

/** Writes the settings file atomically: directory 0700 (when created here), file 0600. On Windows, a plain write. */
export function writeSettingsFile(path: string, settings: Settings): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const clean: Settings = {};
  for (const key of SETTING_KEYS) if (settings[key]) clean[key] = settings[key];
  const tmp = join(dir, `.mcp.json.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 });
  if (POSIX) chmodSync(tmp, 0o600);
  renameSync(tmp, path);
  if (POSIX) chmodSync(path, 0o600);
}

export type ResolvedSettings = {
  /** Settings to validate: the file's values, overridden by any non-empty environment variable. */
  values: Settings;
  /** Where each value came from. */
  sources: Partial<Record<SettingKey, "env" | "file">>;
  file: SettingsFile;
};

/** Environment variables take precedence over the saved file, so existing `-e`/`env` configs keep working. */
export function resolveSettings(env: Env = process.env, path = settingsPath(env)): ResolvedSettings {
  const file = readSettingsFile(path);
  const values: Settings = {};
  const sources: ResolvedSettings["sources"] = {};
  for (const key of SETTING_KEYS) {
    if (env[key]) {
      values[key] = env[key];
      sources[key] = "env";
    } else if (file.settings[key]) {
      values[key] = file.settings[key];
      sources[key] = "file";
    }
  }
  return { values, sources, file };
}
