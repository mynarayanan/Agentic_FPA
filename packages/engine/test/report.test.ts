import { describe, expect, it } from 'vitest';
import { buildVarianceReport } from '../src';
import { loadTable } from './fixtures';

const CR = 10_000_000;
const gl = loadTable('fact_gl');
const accounts = loadTable('dim_account');
const sales = loadTable('fact_sales_line');
const rows = (v: string, entity?: string) =>
  gl.filter(
    (r) => r.version_id === v && r.period === '2026-11' && (!entity || r.entity_id === entity),
  );
const base = (entity?: string) => ({
  period: '2026-11',
  entity,
  actualVersion: 'ACT_FY27',
  budgetVersion: 'BUD_FY27',
  actualGl: rows('ACT_FY27', entity),
  budgetGl: rows('BUD_FY27', entity),
  accounts,
  actualLines: sales.filter((r) => r.version_id === 'ACT_FY27'),
  budgetLines: sales.filter((r) => r.version_id === 'BUD_FY27'),
});

describe('buildVarianceReport', () => {
  it('assembles the November group report with calc references and account names', () => {
    const r = buildVarianceReport({ ...base(), names: { accounts: {}, bus: {}, entities: {} } });
    expect(r?.pnl.revenue.variance).toBe(-8 * CR);
    expect(r?.revenue_bridge?.total).toBe(-8 * CR);
    expect(r?.calc_refs.map((c) => c.id).sort()).toEqual([
      'VAR-OPX-001',
      'VAR-PNL-001',
      'VAR-REV-002',
    ]);
    expect(r?.accounts.find((a) => a.account_id === '6300')?.name).toBe(
      'Consulting & Professional Fees',
    );
    expect(r?.entity_id).toBeNull();
  });
  it('slices the bridge for an entity while using entity GL rows', () => {
    const r = buildVarianceReport(base('E-IN'));
    expect(r?.entity_id).toBe('E-IN');
    expect(r?.revenue_bridge?.cells.every((c) => c.entity_id === 'E-IN')).toBe(true);
    expect(r?.names).toBeNull();
  });
  it('omits the bridge without sales lines and returns null without data', () => {
    const r = buildVarianceReport({ ...base(), actualLines: [], budgetLines: undefined });
    expect(r?.revenue_bridge).toBeNull();
    expect(r?.calc_refs.map((c) => c.id)).not.toContain('VAR-REV-002');
    expect(buildVarianceReport({ ...base(), actualGl: [] })).toBeNull();
    expect(buildVarianceReport({ ...base(), budgetGl: [] })).toBeNull();
  });
});
