import { defineConfig } from "tsup";

// ESM with types; React stays a peer dependency. The "use client" banner lets Next.js App Router pages import it.
// pnpm swaps package.json's exports for publishConfig's when packing, so the workspace keeps using src/.
export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  target: "es2020",
  dts: true,
  clean: true,
  external: ["react", "react/jsx-runtime"],
  banner: { js: '"use client";' },
});
