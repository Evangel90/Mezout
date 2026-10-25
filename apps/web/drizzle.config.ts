import path from "node:path";
import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.resolve(__dirname, "../.."), true, undefined, true);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/server/db/schema.ts",
  out: "./drizzle",
  // `pnpm db:migrate:prod` sets MIGRATE_TARGET=production to migrate Neon through its direct (unpooled) URL.
  dbCredentials: {
    url: (process.env.MIGRATE_TARGET === "production" ? process.env.DATABASE_URL_UNPOOLED : process.env.DATABASE_URL) ?? "",
  },
});
