import { createServerlessDb } from '@fpa/db';
import { getPooledTxDb } from '@fpa/db/server';

/** Neon's HTTP driver only works against Neon. Any other Postgres (local, docker) uses a normal pooled connection. */
const isNeon = (url: string): boolean => /\.neon\.(tech|build)\b/.test(url);

/** Read client. Null when DATABASE_URL is not configured. */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return isNeon(url) ? createServerlessDb(url) : getPooledTxDb(url);
}

/** Pooled TCP client for routes that write inside transactions. Null when DATABASE_URL is not configured. */
export function getTxDb() {
  const url = process.env.DATABASE_URL;
  return url ? getPooledTxDb(url) : null;
}

export const noDb = () =>
  Response.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
export const now = () => new Date().toISOString();
export const readJson = (req: Request) => req.json().catch(() => null);
