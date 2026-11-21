import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Db } from './client';

const g = globalThis as { __fpaPool?: pg.Pool };

/**
 * Transaction-capable client for serverless functions that WRITE (approvals need row locks and
 * atomic multi-statement updates, which the Neon HTTP driver cannot do). The pool is cached across
 * invocations of a warm function and kept small to respect connection limits.
 */
export function getPooledTxDb(url: string): Db {
  g.__fpaPool ??= new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 3) });
  return drizzle(g.__fpaPool) as unknown as Db;
}
