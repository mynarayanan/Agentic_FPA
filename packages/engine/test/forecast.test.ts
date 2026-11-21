import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { compareForecasts, runScenario } from '../src';
import type { BridgeRow, ForecastComparisonInput, MonthRevenue, PnlLines } from '../src';
import { loadTable } from './fixtures';

const CR = 10_000_000;
const gl = loadTable('fact_gl');
const accounts = new Map(loadTable('dim_account').map((a) => [a.account_id, a.type]));
const months = (version: string): MonthRevenue[] => {
  const m = new Map<string, number>();
  for (const r of gl.filter(
    (x) => x.version_id === version && accounts.get(x.account_id) === 'REVENUE',
  ))
    m.set(r.period, (m.get(r.period) ?? 0) + r.amount_inr);
  return [...m.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([period, revenue_inr]) => ({ period, revenue_inr }));
};
const input = (): ForecastComparisonInput => ({
  closedThrough: '2026-11',
  budget: months('BUD_FY27'),
  previous: months('FC_FY27_OCT'),
  latest: months('FC_FY27_NOV'),
  priorYear: months('ACT_FY26'),
  bridge: loadTable('fact_forecast_bridge').map((b) => ({
    driver: b.driver,
    sub_driver: b.sub_driver,
    period: b.period,
    amount_inr: b.amount_inr,
  })),
});

describe('compareForecasts on the synthetic fixtures (FCS-CMP-001)', () => {
  const r = compareForecasts(input());
  it('matches the full-year story: 1,200 -> 1,200 -> 1,150 Cr, prior year 1,115', () => {
    expect(r.full_year).toEqual({
      budget: 1200 * CR,
      previous: 1200 * CR,
      latest: 1150 * CR,
      prior_year: 1115 * CR,
    });
    expect(r.change_vs_previous).toBe(-50 * CR);
    expect(r.change_vs_previous_bps).toBe(-417);
    expect(r.change_vs_budget).toBe(-50 * CR);
    expect(r.growth_previous_bps).toBe(762);
    expect(r.growth_latest_bps).toBe(314);
  });
  it('splits the latest forecast into 768 Cr of actuals and 382 Cr still to come', () => {
    expect(r.actual_to_date_latest).toBe(768 * CR);
    expect(r.remaining_latest).toBe(382 * CR);
  });
  it('attributes the change: demand -25, FX -10, order delay -15, and it reconciles for every month', () => {
    expect(r.bridge.by_driver).toEqual({ DEMAND: -25 * CR, FX: -10 * CR, ORDER_DELAY: -15 * CR });
    expect(r.bridge.total).toBe(-50 * CR);
    expect(r.bridge.reconciles).toBe(true);
    expect(r.bridge.unreconciled_periods).toEqual([]);
  });
  it('shows actual-to-date versus remaining for each driver line', () => {
    const line = (d: string, s: string) =>
      r.bridge.lines.find((l) => l.driver === d && l.sub_driver === s);
    expect(line('DEMAND', 'PRICE')).toMatchObject({ actual_to_date: -2 * CR, remaining: 0 });
    expect(line('FX', 'RATE')).toMatchObject({ actual_to_date: 0, remaining: -10 * CR });
    expect(line('ORDER_DELAY', 'SLIPPAGE')?.total).toBe(-15 * CR);
    expect(line('ORDER_DELAY', 'TIMING')).toMatchObject({
      actual_to_date: -1 * CR,
      remaining: 1 * CR,
    });
  });
  it('lists twelve ordered months with the change per month', () => {
    expect(r.months).toHaveLength(12);
    expect(r.months[0]?.period).toBe('2026-04');
    expect(r.months[11]?.period).toBe('2027-03');
    expect(r.months.find((m) => m.period === '2026-12')?.change).toBe(-21 * CR);
    expect(r.months.reduce((s, m) => s + m.change, 0)).toBe(r.change_vs_previous);
  });
});

describe('compareForecasts safeguards', () => {
  it('flags a bridge that does not add up, naming the months', () => {
    const i = input();
    i.bridge.push({ driver: 'DEMAND', sub_driver: 'OUTLOOK', period: '2027-01', amount_inr: 1000 });
    i.bridge.push({ driver: 'DEMAND', sub_driver: 'OUTLOOK', period: '2030-01', amount_inr: 5 });
    const r = compareForecasts(i);
    expect(r.bridge.reconciles).toBe(false);
    expect(r.bridge.unreconciled_periods).toEqual(['2027-01', '2030-01']);
  });
  it('returns null percentages when the base is zero', () => {
    const z = (v: number): MonthRevenue[] => [{ period: '2026-04', revenue_inr: v }];
    const r = compareForecasts({
      closedThrough: '2026-04',
      budget: z(0),
      previous: z(0),
      latest: z(5),
      priorYear: z(0),
      bridge: [],
    });
    expect(r).toMatchObject({
      change_vs_previous_bps: null,
      change_vs_budget_bps: null,
      growth_latest_bps: null,
    });
  });
  it('rejects mismatched, unordered or fractional input', () => {
    const i = input();
    expect(() => compareForecasts({ ...i, latest: i.latest.slice(1) })).toThrow(/same number/);
    expect(() =>
      compareForecasts({ ...i, budget: [], previous: [], latest: [], priorYear: [] }),
    ).toThrow(/same number/);
    expect(() =>
      compareForecasts({
        ...i,
        latest: i.latest.map((m, k) => (k === 3 ? { ...m, period: '2099-01' } : m)),
      }),
    ).toThrow(/period mismatch/);
    const reversed = [...i.budget].reverse();
    expect(() =>
      compareForecasts({
        ...i,
        budget: reversed,
        previous: [...i.previous].reverse(),
        latest: [...i.latest].reverse(),
        priorYear: [...i.priorYear].reverse(),
      }),
    ).toThrow(/ascending/);
    expect(() =>
      compareForecasts({
        ...i,
        bridge: [{ driver: 'X', sub_driver: 'Y', period: '2026-12', amount_inr: 1.5 }],
      }),
    ).toThrow(RangeError);
  });
  it('property: a bridge built from the month deltas always reconciles; breaking one amount never does', () => {
    const arb = fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 1e9 }),
        fc.integer({ min: 0, max: 1e9 }),
        fc.integer({ min: 0, max: 1e9 }),
      ),
      { minLength: 1, maxLength: 12 },
    );
    fc.assert(
      fc.property(arb, fc.integer({ min: 1, max: 1000 }), (rows, bump) => {
        const mk = (k: number): MonthRevenue[] =>
          rows.map((r, i) => ({
            period: `2026-${String(i + 1).padStart(2, '0')}`,
            revenue_inr: r[k] as number,
          }));
        const [budget, previous, latest] = [mk(0), mk(1), mk(2)];
        const bridge: BridgeRow[] = latest.map((l, i) => ({
          driver: 'D',
          sub_driver: 'S',
          period: l.period,
          amount_inr: l.revenue_inr - (previous[i] as MonthRevenue).revenue_inr,
        }));
        const base = { closedThrough: '2026-01', budget, previous, latest, priorYear: budget };
        expect(compareForecasts({ ...base, bridge }).bridge.reconciles).toBe(true);
        const broken = bridge.map((b, i) =>
          i === 0 ? { ...b, amount_inr: b.amount_inr + bump } : b,
        );
        expect(compareForecasts({ ...base, bridge: broken }).bridge.unreconciled_periods).toEqual([
          '2026-01',
        ]);
      }),
    );
  });
});

const lines = (o: Partial<PnlLines> = {}): PnlLines => ({
  revenue: 1000 * CR,
  materials: 500 * CR,
  labour: 100 * CR,
  overheads: 100 * CR,
  freight: 50 * CR,
  opex: 200 * CR,
  ...o,
});
const zero = { volume_bps: 0, price_bps: 0, material_cost_bps: 0, opex_bps: 0 };

describe('runScenario (SCN-WHI-001)', () => {
  it('hand-worked: volume -5% and material cost +3% on 1,000 Cr of remaining revenue', () => {
    const r = runScenario(
      {
        ytd: lines({ revenue: 0, materials: 0, labour: 0, overheads: 0, freight: 0, opex: 0 }),
        remaining: lines(),
      },
      { ...zero, volume_bps: -500, material_cost_bps: 300 },
    );
    // revenue 950; materials 500 x 0.95 x 1.03 = 489.25; freight 47.5; labour and overheads 100 each; opex 200
    expect(r.remaining_after).toMatchObject({
      revenue: 950 * CR,
      materials: 489.25 * CR,
      freight: 47.5 * CR,
      labour: 100 * CR,
      overheads: 100 * CR,
      opex: 200 * CR,
    });
    expect(r.remaining_before.operating_profit).toBe(50 * CR);
    expect(r.remaining_after.operating_profit).toBe(13.25 * CR);
    expect(r.delta.operating_profit).toBe(-36.75 * CR);
  });
  it('price applies after volume and only to revenue', () => {
    const r = runScenario(
      { ytd: lines(), remaining: lines() },
      { ...zero, volume_bps: -1000, price_bps: 200 },
    );
    expect(r.remaining_after.revenue).toBe(918 * CR); // 1000 x 0.90 x 1.02
    expect(r.remaining_after.materials).toBe(450 * CR); // volume only
  });
  it('opex shock scales operating expenses; actuals to date never move', () => {
    const r = runScenario(
      { ytd: lines({ revenue: 7 }), remaining: lines() },
      { ...zero, opex_bps: 1000 },
    );
    expect(r.remaining_after.opex).toBe(220 * CR);
    expect(r.full_year_after.revenue).toBe(r.full_year_before.revenue);
    expect(r.full_year_after.revenue).toBe(1000 * CR + 7);
    expect(r.assumptions.join(' ')).toContain('EBITDA proxy');
  });
  it('zero shocks change nothing', () => {
    const r = runScenario({ ytd: lines(), remaining: lines() }, zero);
    expect(r.full_year_after).toEqual(r.full_year_before);
    expect(r.delta.operating_profit).toBe(0);
  });
  it('rejects out-of-range or fractional shocks and fractional amounts', () => {
    expect(() =>
      runScenario({ ytd: lines(), remaining: lines() }, { ...zero, volume_bps: 5001 }),
    ).toThrow(RangeError);
    expect(() =>
      runScenario({ ytd: lines(), remaining: lines() }, { ...zero, price_bps: -5001 }),
    ).toThrow(RangeError);
    expect(() =>
      runScenario({ ytd: lines(), remaining: lines() }, { ...zero, opex_bps: 1.5 }),
    ).toThrow(RangeError);
    expect(() => runScenario({ ytd: lines(), remaining: lines({ revenue: 1.5 }) }, zero)).toThrow(
      RangeError,
    );
  });
  it('properties: operating profit always equals revenue - cost of sales - opex; fixed lines never move; higher costs never raise profit', () => {
    const shock = fc.integer({ min: -5000, max: 5000 });
    const amt = fc.integer({ min: 0, max: 1e10 });
    fc.assert(
      fc.property(
        fc.record({
          revenue: amt,
          materials: amt,
          labour: amt,
          overheads: amt,
          freight: amt,
          opex: amt,
        }),
        shock,
        shock,
        shock,
        shock,
        (l, v, p, m, o) => {
          const r = runScenario(
            { ytd: l, remaining: l },
            { volume_bps: v, price_bps: p, material_cost_bps: m, opex_bps: o },
          );
          for (const x of [r.remaining_after, r.full_year_after, r.remaining_before])
            expect(x.operating_profit).toBe(x.revenue - x.cost_of_sales - x.opex);
          expect(r.remaining_after.labour).toBe(l.labour);
          expect(r.remaining_after.overheads).toBe(l.overheads);
          const worse = runScenario(
            { ytd: l, remaining: l },
            {
              volume_bps: v,
              price_bps: p,
              material_cost_bps: Math.min(5000, m + 100),
              opex_bps: Math.min(5000, o + 100),
            },
          );
          expect(worse.remaining_after.operating_profit).toBeLessThanOrEqual(
            r.remaining_after.operating_profit,
          );
        },
      ),
    );
  });
});
