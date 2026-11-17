import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffOutputs, renderDictionary, writeOutputs } from './emit';
import { generateDataset } from './index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dataDir = join(root, 'data');
const dictPath = join(root, 'docs', 'data-dictionary.md');
const mode = process.argv[2];
const ds = generateDataset();

if (mode === 'generate') {
  writeOutputs(ds, dataDir);
  mkdirSync(dirname(dictPath), { recursive: true });
  writeFileSync(dictPath, renderDictionary(ds));
  console.log(`Wrote fixtures to data/ and docs/data-dictionary.md`);
} else if (mode === 'check') {
  const stale = diffOutputs(ds, dataDir);
  if (stale.length > 0) {
    console.error(`Fixtures are stale or missing: ${stale.join(', ')}\nRun: pnpm data:generate`);
    process.exit(1);
  }
  console.log('Fixtures match the generator output.');
} else {
  console.error('Usage: cli.ts generate | check');
  process.exit(1);
}
