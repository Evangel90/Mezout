import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hermesHome, type ClientId, type Ctx } from "./clients";

/**
 * The Mezout agent skill (skills/mezout in the repository, dist/skills/mezout in the npm package) and where each
 * client loads personal skills from, as of November 2026:
 * - Claude Code: ~/.claude/skills/<name>/SKILL.md. https://code.claude.com/docs/en/skills
 * - Codex: ~/.agents/skills (user scope). https://developers.openai.com/codex/skills
 * - Cursor: ~/.cursor/skills. https://github.com/vercel-labs/skills/blob/main/docs/agents.md
 * - Hermes Agent: ~/.hermes/skills. https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
 * Claude Desktop takes skills as an upload in its settings, so it has no folder here.
 */
export const SKILL_NAME = "mezout";

export function skillDir(client: ClientId, ctx: Ctx): string | null {
  switch (client) {
    case "claude-code":
      return join(ctx.home, ".claude", "skills", SKILL_NAME);
    case "codex":
      return join(ctx.home, ".agents", "skills", SKILL_NAME);
    case "cursor":
      return join(ctx.home, ".cursor", "skills", SKILL_NAME);
    case "hermes":
      return join(hermesHome(ctx), "skills", SKILL_NAME);
    case "claude-desktop":
      return null;
  }
}

/** The skill shipped with this package, or the repository copy when running from source. */
export function bundledSkillDir(): string | null {
  for (const rel of ["./skills/mezout", "../../../skills/mezout"]) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(join(dir, "SKILL.md"))) return dir;
  }
  return null;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

function sameTree(a: string, b: string): boolean {
  const fa = listFiles(a);
  const fb = listFiles(b);
  return fa.length === fb.length && fa.every((f, i) => f === fb[i] && readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
}

export type SkillOutcome = { client: ClientId; status: "installed" | "updated" | "already" | "skipped"; detail: string; backup?: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

/**
 * Copies the skill into a client's skills folder. An identical copy is left alone; a different one is moved to
 * ~/.mezout/backups first (not beside it, where the client would load both); a symlink, which `npx skills` makes, is
 * never touched.
 */
export function installSkill(client: ClientId, source: string, ctx: Ctx): SkillOutcome {
  const target = skillDir(client, ctx);
  if (!target) return { client, status: "skipped", detail: "no skills folder; add skills in its settings" };
  let link = false;
  try {
    link = lstatSync(target).isSymbolicLink();
  } catch {
    /* absent */
  }
  if (link) return { client, status: "skipped", detail: `${target} is a link (installed by \`npx skills\`?); update it with \`npx skills update\`` };
  if (existsSync(target)) {
    if (sameTree(source, target)) return { client, status: "already", detail: `up to date in ${target}` };
    const backup = join(ctx.home, ".mezout", "backups", "skills", `${client}-${stamp(ctx.now?.() ?? new Date())}`);
    mkdirSync(dirname(backup), { recursive: true });
    try {
      renameSync(target, backup);
    } catch {
      cpSync(target, backup, { recursive: true });
      rmSync(target, { recursive: true, force: true });
    }
    cpSync(source, target, { recursive: true });
    return { client, status: "updated", detail: `updated ${target}`, backup };
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
  return { client, status: "installed", detail: `installed in ${target}` };
}
