import { describe, expect, it } from 'vitest';
import { accountVariances, pnlVariance, revenueBridge, varianceBps } from '../src';
import { loadJson, loadTable } from './fixtures';

const CR = 10_000_000;
const gl = loadTable('fact_gl');
const accounts = loadTable('dim_account');
const sales = loadTable('fact_sales_line');
const rows = (version: string, period: string) =>
  gl.filter((r) => r.version_id === version && r.period === period);

interface Golden {
  nov2026: {
    revenue: { budget: number; actual: number; variance: number };
    opex: { variance: number };
    operating_profit: { budget: number; actual: number; variance: number };
    opex_overrun_pct: number;
    opex_by_account: Record<string, { variance: number }>;
  };
  revenue_bridge_nov2026: {
    timing: number;
    price: number;
    volume: number;
    mix: number;
    total: number;
    industrial_equipment_unit_decline_pct: number;
  };
}
const golden = loadJson<Golden>('golden/nov2026.json');
const questions =
  loadJson<Array<{ id: string; expected: Record<string, unknown> }>>('golden/questions.json');
const q = (id: string) =>
  (questions.find((x) => x.id === id) as { expected: Record<string, number> }).expected;

describe('P&L variance, November 2026 (VAR-PNL-001, VAR-OPX-001)', () => {
  const v = pnlVariance(rows('ACT_FY27', '2026-11'), rows('BUD_FY27', '2026-11'), accounts);
  it('matches the CFO scenario exactly', () => {
    expect(v.revenue).toMatchObject({
      budget: 100 * CR,
      actual: 92 * CR,
      variance: -8 * CR,
      favourable: false,
    });
    expect(v.opex).toMatchObject({
      budget: 35 * CR,
      actual: 39 * CR,
      variance: 4 * CR,
      variance_bps: 1143,
      favourable: false,
    });
    expect(v.otherOperatingCosts).toMatchObject({ variance: -5 * CR, favourable: true });
    expect(v.operatingProfit).toMatchObject({ budget: 15 * CR, actual: 8 * CR, variance: -7 * CR });
  });
  it('operating profit variance = revenue - other costs - opex variances', () => {
    expect(v.operatingProfit.variance).toBe(
      v.revenue.variance - v.otherOperatingCosts.variance - v.opex.variance,
    );
  });
  it('agrees with the golden file and the golden questions', () => {
    expect(v.revenue.variance).toBe(golden.nov2026.revenue.variance);
    expect(v.operatingProfit.variance).toBe(q('Q02').value_inr);
    expect(v.revenue.variance).toBe(q('Q01').value_inr);
    expect(v.opex.variance_bps).toBe(Math.round(golden.nov2026.opex_overrun_pct * 100));
  });
  it('ranks the largest opex overruns: consulting, contractors, travel', () => {
    const opex = accountVariances(
      rows('ACT_FY27', '2026-11'),
      rows('BUD_FY27', '2026-11'),
      accounts,
    ).filter((a) => a.type === 'OPEX' && !a.favourable);
    expect(opex.slice(0, 3).map((a) => a.account_id)).toEqual(['6300', '6400', '6200']);
    for (const a of opex)
      expect(a.variance).toBe(golden.nov2026.opex_by_account[a.account_id]?.variance);
  });
});

describe('revenue bridge, November 2026 (VAR-REV-002)', () => {
  const bud = sales.filter((r) => r.version_id === 'BUD_FY27');
  const act = sales.filter((r) => r.version_id === 'ACT_FY27');
  const b = revenueBridge(bud, act);
  it('sums exactly to -8 Cr with timing -1 and price -2', () => {
    expect(b.total).toBe(-8 * CR);
    expect(b.timing).toBe(-1 * CR);
    expect(b.price).toBe(-2 * CR);
    expect(b.volume + b.mix).toBe(-5 * CR);
  });
  it('equals the generator reference implementation and the golden questions', () => {
    expect(b).toMatchObject({
      timing: golden.revenue_bridge_nov2026.timing,
      price: golden.revenue_bridge_nov2026.price,
      volume: golden.revenue_bridge_nov2026.volume,
      mix: golden.revenue_bridge_nov2026.mix,
    });
    expect(b.price).toBe(q('Q04').value_inr);
    expect(b.timing).toBe(q('Q05').value_inr);
    expect({ volume_inr: b.volume, mix_inr: b.mix }).toEqual(q('Q06'));
  });
  it('reproduces every planted entity x BU x driver row of the forecast bridge for November', () => {
    const planted = loadTable('fact_forecast_bridge').filter((r) => r.period === '2026-11');
    const key = (e: string, bu: string, sub: string) => `${e}|${bu}|${sub}`;
    const expected = new Map(
      planted.map((r) => [key(r.entity_id, r.bu_id, r.sub_driver), r.amount_inr]),
    );
    const got = new Map<string, number>();
    for (const c of b.cells) {
      for (const [sub, amt] of [
        ['PRICE', c.price],
        ['VOLUME', c.volume],
        ['MIX', c.mix],
        ['TIMING', c.timing],
      ] as const) {
        if (amt !== 0) got.set(key(c.entity_id, c.bu_id, sub), amt);
      }
    }
    expect(got).toEqual(expected);
  });
  it('shows Industrial Equipment units about 12% down, with other BUs flat', () => {
    const ie = b.byBu.find((x) => x.bu_id === 'BU-IE');
    expect(ie?.unit_change_bps).toBe(
      Math.round(golden.revenue_bridge_nov2026.industrial_equipment_unit_decline_pct * 100),
    );
    for (const x of b.byBu.filter((y) => y.bu_id !== 'BU-IE'))
      expect(x).toMatchObject({ volume: 0, mix: 0, unit_change_bps: 0 });
  });
  it('is stable regardless of input order', () => {
    const shuffled = [...act].reverse();
    expect(revenueBridge([...bud].reverse(), shuffled)).toEqual(b);
  });
});

describe('varianceBps', () => {
  it('rounds half up and handles zero and negative budgets', () => {
    expect(varianceBps(4 * CR, 35 * CR)).toBe(1143);
    expect(varianceBps(-8 * CR, 100 * CR)).toBe(-800);
    expect(varianceBps(1, 0)).toBeNull();
    expect(varianceBps(5, -100)).toBe(-500);
  });
});
