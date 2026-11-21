/**
 * Local development database: an in-process Postgres (PGlite) with the schema, fixtures and audit tables,
 * served over the Postgres wire protocol so the app, `pnpm db:*` scripts and psql can connect to it.
 *
 *   pnpm dev:db            then, in another terminal:
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres pnpm --filter @fpa/web dev
 *
 * Data lives in memory and is rebuilt on every start. Not for production.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Db } from './client';
import { loadTables } from './loader';
import { MIGRATIONS_DIR, readFixtures } from './node';

const port = Number(process.env.DEV_DB_PORT ?? 5433);
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data');

const client = new PGlite();
const db = drizzle(client);
await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
const counts = await loadTables(db as unknown as Db, readFixtures(dataDir));
console.log(
  `Loaded ${Object.values(counts).reduce((a, b) => a + b, 0)} rows into ${Object.keys(counts).length} tables.`,
);

const server = new PGLiteSocketServer({ db: client, port, host: '127.0.0.1' });
await server.start();
console.log(`Dev database ready: postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
console.log('Single connection at a time: set PG_POOL_MAX=1 for the app. Press Ctrl+C to stop.');
process.on('SIGINT', async () => {
  await server.stop();
  await client.close();
  process.exit(0);
});
