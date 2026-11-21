import { beforeAll, describe, expect, it } from 'vitest';
import type { RecommendationView } from '@fpa/db';
import { buildAlerts } from '../lib/alerts';
import { loadCockpit, pickEntity, pickPeriod, portfolioTotals } from '../lib/loaders';
import { testDb } from './helpers';

const controls = {
  periods: ['2026-09', '2026-10', '2026-11'],
  entities: [{ entity_id: 'E-IN', name: 'India' }],
};

describe('selectors', () => {
  it('uses a requested period only when it is a known closed period', () => {
    expect(pickPeriod(controls, '2026-10')).toBe('2026-10');
    expect(pickPeriod(controls, '2027-01')).toBe('2026-11');
    expect(pickPeriod(controls, 'bad')).toBe('2026-11');
    expect(pickPeriod(controls, null)).toBe('2026-11');
    expect(pickPeriod(controls)).toBe('2026-11');
  });
  it('uses a requested entity only when it exists', () => {
    expect(pickEntity(controls, 'E-IN')).toBe('E-IN');
    expect(pickEntity(controls, 'E-XX')).toBeUndefined();
    expect(pickEntity(controls, '')).toBeUndefined();
    expect(pickEntity(controls)).toBeUndefined();
  });
});

describe('portfolioTotals', () => {
  const rec = (a: object) => ({ assessment: a }) as unknown as RecommendationView;
  it('adds the engine assessments and is zero when empty', () => {
    const t = portfolioTotals([
      rec({
        gross_inr: 5,
        revenue_impact_inr: 3,
        overlap_haircut_inr: 1,
        net_in_year_profit_inr: 2,
      }),
      rec({
        gross_inr: 7,
        revenue_impact_inr: 0,
        overlap_haircut_inr: 0,
        net_in_year_profit_inr: -1,
      }),
    ]);
    expect(t).toEqual({
      count: 2,
      headline_inr: 12,
      revenue_recovery_inr: 3,
      overlap_haircut_inr: 1,
      net_in_year_profit_inr: 1,
    });
    expect(portfolioTotals([])).toEqual({
      count: 0,
      headline_inr: 0,
      revenue_recovery_inr: 0,
      overlap_haircut_inr: 0,
      net_in_year_profit_inr: 0,
    });
  });
});

describe('alerts', () => {
  let data: Awaited<ReturnType<typeof loadCockpit>>;
  beforeAll(async () => {
    data = await loadCockpit((await testDb()).db);
  });
  const input = () => ({
    report: structuredClone(data.report),
    forecast: structuredClone(data.forecast.comparison),
    statusCounts: {} as Record<string, number>,
    auditOk: true,
  });

  it('raises the four warnings for the November scenario, in a stable order', () => {
    expect(buildAlerts(input()).map((a) => a.level)).toEqual([
      'warning',
      'warning',
      'warning',
      'warning',
    ]);
    expect(buildAlerts(input()).map((a) => a.text)).toEqual([
      'Operating profit is ₹7.00 Cr below budget.',
      'Revenue is 8.00% below budget.',
      'Operating expenses are 11.43% above budget.',
      'The full-year revenue forecast was cut by ₹50.00 Cr (4.17%).',
    ]);
  });
  it('puts critical problems first: a broken audit log and an unreconciled forecast', () => {
    const i = input();
    i.auditOk = false;
    i.forecast.bridge.reconciles = false;
    i.forecast.bridge.unreconciled_periods = ['2026-12'];
    const a = buildAlerts(i);
    expect(a[0]?.level).toBe('critical');
    expect(a[1]?.level).toBe('critical');
    expect(a[1]?.text).toContain('2026-12');
    expect(a.slice(2).every((x) => x.level === 'warning')).toBe(true);
  });
  it('counts recommendations awaiting action, with correct grammar, as the lowest priority', () => {
    const i = input();
    i.statusCounts = { PROPOSED: 1, BUSINESS_VALIDATED: 3 };
    const a = buildAlerts(i);
    expect(a.at(-2)?.text).toBe('1 recommendation awaiting validation.');
    expect(a.at(-1)?.text).toBe('3 recommendations awaiting authorisation.');
    expect(a.at(-1)?.level).toBe('info');
  });
  it('is quiet when everything is on plan', () => {
    const i = input();
    const p = i.report.pnl;
    for (const t of [p.revenue, p.opex, p.operatingProfit]) {
      t.variance = 0;
      t.variance_bps = 0;
    }
    i.forecast.change_vs_previous_bps = 0;
    expect(buildAlerts(i)).toEqual([]);
  });
  it('ignores missing percentages (zero budgets)', () => {
    const i = input();
    i.report.pnl.revenue.variance_bps = null;
    i.report.pnl.opex.variance_bps = null;
    i.forecast.change_vs_previous_bps = null;
    expect(buildAlerts(i).map((a) => a.text)).toEqual([
      'Operating profit is ₹7.00 Cr below budget.',
    ]);
  });
});
