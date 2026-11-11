import { defineConfig } from "tsup";

// One runnable file: the workspace SDK and paywall (TypeScript source) are bundled; npm dependencies stay external.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  noExternal: ["@mezout/sdk", "@mezout/paywall"],
});
