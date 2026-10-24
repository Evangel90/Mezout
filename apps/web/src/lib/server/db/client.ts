import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { mezoutPool?: Pool };

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing environment variable DATABASE_URL");
  // pg already treats sslmode=require as verify-full; saying so explicitly silences its per-connection warning.
  const connectionString = url.replace(/sslmode=require\b/, "sslmode=verify-full");
  globalForDb.mezoutPool ??= new Pool({ connectionString, max: 5 });
  return drizzle(globalForDb.mezoutPool, { schema });
}
