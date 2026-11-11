import { cpSync, existsSync } from "node:fs";
import { defineConfig } from "tsup";

// One runnable file: the workspace SDK and paywall (TypeScript source) are bundled; npm dependencies stay external.
// The agent skill (skills/mezout at the repository root) ships in dist/skills so `init` can install it.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  noExternal: ["@mezout/sdk", "@mezout/paywall"],
  async onSuccess() {
    const skill = "../../skills/mezout";
    if (!existsSync(`${skill}/SKILL.md`)) throw new Error("skills/mezout/SKILL.md is missing");
    cpSync(skill, "dist/skills/mezout", { recursive: true });
  },
});
