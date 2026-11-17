import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTables } from './loader';
import { createPgDb, migrateNode, readExpected, readFixtures } from './node';
import { verifyLoad } from './verify';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data');
const [cmd, ...flags] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Use the Neon connection string (sslmode=require).');
  process.exit(1);
}
const { db, close } = createPgDb(url);

async function main(): Promise<void> {
  if (cmd === 'migrate') {
    await migrateNode(db);
    console.log('Migrations applied.');
  } else if (cmd === 'load') {
    if (!flags.includes('--yes')) {
      console.error(
        'This TRUNCATES all 19 FP&A tables in the target database. Re-run with --yes to confirm.',
      );
      process.exitCode = 1;
      return;
    }
    await migrateNode(db);
    const counts = await loadTables(db, readFixtures(dataDir));
    console.log(
      'Loaded:',
      Object.entries(counts)
        .map(([t, n]) => `${t}=${n}`)
        .join(' '),
    );
    await verify();
  } else if (cmd === 'verify') {
    await verify();
  } else {
    console.error('Usage: cli.ts migrate | load --yes | verify');
    process.exitCode = 1;
  }
}

async function verify(): Promise<void> {
  const checks = await verifyLoad(db, readExpected(dataDir));
  const failed = checks.filter((c) => !c.ok);
  for (const c of failed) console.error(`FAIL ${c.name}: expected ${c.expected}, got ${c.actual}`);
  console.log(`${checks.length - failed.length}/${checks.length} reconciliation checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => close());
