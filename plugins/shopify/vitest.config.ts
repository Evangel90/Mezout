import { defineConfig } from "vitest/config";

// Unit tests run without the React Router plugin from vite.config.ts.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
