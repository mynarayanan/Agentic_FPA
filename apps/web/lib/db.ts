import { createServerlessDb } from '@fpa/db';

/** Per-request read-only client. Returns null when DATABASE_URL is not configured. */
export function getDb() {
  const url = process.env.DATABASE_URL;
  return url ? createServerlessDb(url) : null;
}
