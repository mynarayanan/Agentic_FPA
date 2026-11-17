import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/** Driver-agnostic Drizzle Postgres database (Neon HTTP, node-postgres or PGlite). */
export type Db = PgDatabase<PgQueryResultHKT>;

/** Read-only, per-request client for Vercel functions (HTTP, no transactions). */
export function createServerlessDb(url: string): Db {
  return drizzle(neon(url)) as unknown as Db;
}

/** drizzle `execute` returns `{ rows }` on pg drivers and an array on some others. */
export function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  if (!rows) throw new Error('unexpected query result shape');
  return rows;
}
