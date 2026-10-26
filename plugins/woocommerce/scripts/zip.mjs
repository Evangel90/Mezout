// Builds dist/mezout-woocommerce-<version>.zip, ready for Plugins → Add New → Upload Plugin.
// Run in a terminal, in the Mezout/plugins/woocommerce folder:  pnpm zip
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";

const version = readFileSync("mezout-woocommerce/mezout-woocommerce.php", "utf8").match(/^ \* Version:\s+(\S+)/m)[1];
const out = `dist/mezout-woocommerce-${version}.zip`;
mkdirSync("dist", { recursive: true });
rmSync(out, { force: true });
execFileSync("zip", ["-rq", out, "mezout-woocommerce", "-x", "mezout-woocommerce/tests/*", "*.DS_Store"], { stdio: "inherit" });
console.log(`built ${out}`);
