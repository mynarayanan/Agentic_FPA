/**
 * Live evaluation against the real model. NOT part of CI (needs a key and costs tokens).
 *   ANTHROPIC_API_KEY=... pnpm --filter @fpa/narrative eval:live [--runs 5] [--entity E-IN]
 * Reports how often the model passes the guard without help (OK), after one correction (RETRIED), or not at all (FALLBACK).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVarianceReport } from '@fpa/engine';
import { parseTable } from '@fpa/semantic';
import type { TableName } from '@fpa/semantic';
import { anthropicClient, generateNarrative } from '../src';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const runs = Number(flag('--runs') ?? 5);
const entity = flag('--entity');
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Set ANTHROPIC_API_KEY to run the live evaluation.');
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'fixtures');
const load = <T extends TableName>(t: T) =>
  parseTable(t, readFileSync(join(dir, `${t}.csv`), 'utf8'));
const gl = load('fact_gl');
const sales = load('fact_sales_line');
const rows = (v: string) =>
  gl.filter(
    (r) => r.version_id === v && r.period === '2026-11' && (!entity || r.entity_id === entity),
  );
const names = (rs: Array<{ name: string }>, key: string) =>
  Object.fromEntries(
    rs.map((r) => [(r as unknown as Record<string, string>)[key] as string, r.name]),
  );
const report = buildVarianceReport({
  period: '2026-11',
  entity,
  actualVersion: 'ACT_FY27',
  budgetVersion: 'BUD_FY27',
  actualGl: rows('ACT_FY27'),
  budgetGl: rows('BUD_FY27'),
  accounts: load('dim_account'),
  actualLines: sales.filter((r) => r.version_id === 'ACT_FY27'),
  budgetLines: sales.filter((r) => r.version_id === 'BUD_FY27'),
  names: {
    accounts: names(load('dim_account'), 'account_id'),
    bus: names(load('dim_bu'), 'bu_id'),
    entities: names(load('dim_entity'), 'entity_id'),
  },
});
if (!report) throw new Error('no data for the requested scope');

const llm = anthropicClient({ apiKey, model: process.env.ANTHROPIC_MODEL });
const tally: Record<string, number> = { OK: 0, RETRIED: 0, FALLBACK: 0 };
for (let i = 1; i <= runs; i++) {
  const n = await generateNarrative(llm, report);
  tally[n.status] = (tally[n.status] ?? 0) + 1;
  console.log(
    `run ${i}: ${n.status} (attempts ${n.attempts})${n.violations.length ? ` violations: ${n.violations.map((v) => v.code).join(', ')}` : ''}`,
  );
  if (i === 1)
    console.log([n.headline, ...n.statements].map((s) => `  [${s.kind}] ${s.text}`).join('\n'));
}
console.log(
  `\nmodel ${llm.model}: first-time pass ${tally.OK}/${runs}, after retry ${tally.RETRIED}/${runs}, fell back ${tally.FALLBACK}/${runs}`,
);
process.exit((tally.FALLBACK ?? 0) > 0 ? 1 : 0);
