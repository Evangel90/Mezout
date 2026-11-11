import { defineConfig } from "tsup";

// Bundles the workspace SDK (TypeScript source) so dist/ runs in plain Node; viem stays a dependency.
export default defineConfig({
  entry: ["src/index.ts", "src/express.ts", "src/next.ts", "src/client.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  noExternal: ["@mezout/sdk"],
  external: ["viem", "express"],
});
