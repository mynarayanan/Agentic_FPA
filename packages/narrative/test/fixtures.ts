import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildVarianceReport } from '@fpa/engine';
import type { VarianceReport } from '@fpa/engine';
import { parseTable } from '@fpa/semantic';
import type { TableName } from '@fpa/semantic';
import { buildFactSheet } from '../src';

const dir = join(__dirname, '..', '..', '..', 'data', 'fixtures');
const load = <T extends TableName>(t: T) =>
  parseTable(t, readFileSync(join(dir, `${t}.csv`), 'utf8'));

/** The real November 2026 group report, computed by the engine from the committed fixtures. */
export function novReport(entity?: string): VarianceReport {
  const gl = load('fact_gl');
  const sales = load('fact_sales_line');
  const rows = (v: string) =>
    gl.filter(
      (r) => r.version_id === v && r.period === '2026-11' && (!entity || r.entity_id === entity),
    );
  const nameOf = (rows: Array<Record<string, string>>, k: string) =>
    Object.fromEntries(rows.map((r) => [r[k] as string, r.name as string]));
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
      accounts: nameOf(load('dim_account') as never, 'account_id'),
      bus: nameOf(load('dim_bu') as never, 'bu_id'),
      entities: nameOf(load('dim_entity') as never, 'entity_id'),
    },
  });
  if (!report) throw new Error('no report');
  return report;
}

export const novSheet = () => buildFactSheet(novReport());
export const idOf = (sheet: ReturnType<typeof novSheet>, key: string): string => {
  const f = sheet.facts.find((x) => x.key === key);
  if (!f) throw new Error(`no fact ${key}`);
  return f.id;
};
