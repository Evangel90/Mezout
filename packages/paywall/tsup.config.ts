import { defineConfig } from "tsup";

// Bundles the workspace SDK (TypeScript source) so dist/ runs in plain Node and its types stand alone; viem stays a
// dependency. pnpm swaps package.json's exports for publishConfig's when packing, so the workspace keeps using src/.
export default defineConfig({
  entry: ["src/index.ts", "src/express.ts", "src/next.ts", "src/client.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  // The SDK's types are inlined too (through tsconfig.build.json paths), so they stand alone.
  tsconfig: "tsconfig.build.json",
  dts: true,
  clean: true,
  noExternal: ["@mezout/sdk"],
  external: ["viem", "express"],
});
