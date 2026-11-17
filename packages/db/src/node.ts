import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { TABLE_NAMES, parseTable } from '@fpa/semantic';
import type { Db } from './client';
import type { TableData } from './loader';
import type { Expected } from './verify';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

/** Direct (TCP) connection for CLI work: migrations and loads, which need transactions. */
export function createPgDb(url: string): { db: Db; close: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  return { db: drizzle(pool) as unknown as Db, close: () => pool.end() };
}

export async function migrateNode(db: Db): Promise<void> {
  await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });
}

/** Read and Zod-validate every fixture CSV under `<dataDir>/fixtures`. */
export function readFixtures(dataDir: string): TableData {
  const out = {} as TableData;
  for (const t of TABLE_NAMES)
    out[t] = parseTable(t, readFileSync(join(dataDir, 'fixtures', `${t}.csv`), 'utf8'));
  return out;
}

export function readExpected(dataDir: string): Expected {
  return {
    manifest: JSON.parse(readFileSync(join(dataDir, 'fixtures', 'MANIFEST.json'), 'utf8')),
    golden: JSON.parse(readFileSync(join(dataDir, 'golden', 'nov2026.json'), 'utf8')),
  };
}
