import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/lib/server/db/client";
import * as schema from "@/lib/server/db/schema";

/** A fresh in-memory Postgres with the real migrations applied. */
export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  return db as unknown as Db;
}
