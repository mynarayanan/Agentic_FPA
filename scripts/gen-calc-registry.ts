import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { calcRegistry } from '../packages/engine/src/registry';

const path = new URL('../docs/calc-registry.md', import.meta.url);
const md = [
  '# Calculation registry (generated)',
  '',
  '> Generated from `packages/engine/src/registry.ts` by `pnpm docs:generate`. CI fails if this file is stale.',
  '',
  '| ID | Name | Formula | Inputs | Version | Methodology |',
  '|---|---|---|---|---|---|',
  ...calcRegistry.map(
    (c) =>
      `| ${c.id} | ${c.name} | \`${c.formula}\` | ${c.inputs.join('; ')} | ${c.version} | ${c.methodologyRef} |`,
  ),
  '',
].join('\n');

if (process.argv.includes('--check')) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (current !== md) {
    console.error('docs/calc-registry.md is stale. Run: pnpm docs:generate');
    process.exit(1);
  }
  console.log('calc registry is up to date');
} else {
  writeFileSync(path, md);
  console.log('wrote docs/calc-registry.md');
}
