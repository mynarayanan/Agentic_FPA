import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { generateDataset } from '../src';
import type { Dataset } from '../src';
import { renderOutputs } from '../src/emit';

const CR = 10_000_000;
type R = Record<string, unknown>;
const n = (v: unknown): number => v as number;
const s = (v: unknown): string => v as string;
const sum = (rows: R[], f: (r: R) => number): number => rows.reduce((a, r) => a + f(r), 0);

let ds: Dataset;
let t: Dataset['tables'];
beforeAll(() => {
  ds = generateDataset();
  t = ds.tables;
});

const gl = (
  version: string,
  period: string | null,
  pred: (a: string) => boolean,
  entity?: string,
): number =>
  sum(
    t.fact_gl.filter(
      (r) =>
        r.version_id === version &&
        (period === null || r.period === period) &&
        pred(s(r.account_id)) &&
        (!entity || r.entity_id === entity),
    ),
    (r) => n(r.amount_inr),
  );
const isRev = (a: string): boolean => a < '5';
const isCogs = (a: string): boolean => a >= '5' && a < '6';
const isOpex = (a: string): boolean => a >= '6';

describe('determinism', () => {
  it('regenerating with the same seed gives byte-identical output', () => {
    const h = (d: Dataset): string =>
      createHash('sha256')
        .update(JSON.stringify(renderOutputs(d)))
        .digest('hex');
    expect(h(generateDataset())).toBe(h(ds));
  });
  it('a different seed changes the data but not the planted headline numbers', () => {
    const other = generateDataset(42);
    const rev = sum(
      other.tables.fact_gl.filter(
        (r) => r.version_id === 'ACT_FY27' && r.period === '2026-11' && s(r.account_id) < '5',
      ),
      (r) => n(r.amount_inr),
    );
    expect(rev).toBe(92 * CR);
    expect(JSON.stringify(other.tables.fact_sales_line)).not.toBe(
      JSON.stringify(t.fact_sales_line),
    );
  });
});

describe('November 2026 CFO scenario ties to the source document', () => {
  it('revenue 100 -> 92 Cr', () => {
    expect(gl('BUD_FY27', '2026-11', isRev)).toBe(100 * CR);
    expect(gl('ACT_FY27', '2026-11', isRev)).toBe(92 * CR);
  });
  it('opex 35 -> 39 Cr (+11.43%)', () => {
    expect(gl('BUD_FY27', '2026-11', isOpex)).toBe(35 * CR);
    expect(gl('ACT_FY27', '2026-11', isOpex)).toBe(39 * CR);
    expect(ds.golden).toMatchObject({ nov2026: { opex_overrun_pct: 11.43 } });
  });
  it('other operating costs 50 -> 45 Cr, so operating profit 15 -> 8 Cr', () => {
    const o = (v: string): number =>
      gl(v, '2026-11', isRev) - gl(v, '2026-11', isCogs) - gl(v, '2026-11', isOpex);
    expect(gl('BUD_FY27', '2026-11', isCogs)).toBe(50 * CR);
    expect(gl('ACT_FY27', '2026-11', isCogs)).toBe(45 * CR);
    expect(o('BUD_FY27')).toBe(15 * CR);
    expect(o('ACT_FY27')).toBe(8 * CR);
  });
});

describe('revenue bridge, recomputed independently from the sales lines', () => {
  const lines = (v: string): R[] => t.fact_sales_line.filter((r) => r.version_id === v);
  it('timing = -1 Cr (three delayed orders)', () => {
    const delayed = lines('ACT_FY27')
      .filter((r) => r.delayed_to_period !== null)
      .map((r) => s(r.line_key));
    expect(delayed).toHaveLength(3);
    const budget = lines('BUD_FY27').filter((r) => delayed.includes(s(r.line_key)));
    expect(sum(budget, (r) => n(r.net_amount_inr))).toBe(1 * CR);
    expect(
      lines('ACT_FY27')
        .filter((r) => delayed.includes(s(r.line_key)))
        .every((r) => n(r.quantity) === 0),
    ).toBe(true);
  });
  it('price = -2 Cr, all discounts in Industrial Equipment and Automation', () => {
    expect(sum(lines('ACT_FY27'), (r) => n(r.discount_inr))).toBe(2 * CR);
    expect(
      lines('ACT_FY27')
        .filter((r) => n(r.discount_inr) > 0)
        .every((r) => ['BU-IE', 'BU-AU'].includes(s(r.bu_id))),
    ).toBe(true);
  });
  it('volume + mix = -5 Cr and the whole bridge sums to exactly -8 Cr', () => {
    const bud = new Map(lines('BUD_FY27').map((r) => [s(r.line_key), r]));
    const nd = lines('ACT_FY27').filter((r) => r.delayed_to_period === null);
    const volMix = sum(
      nd,
      (r) => (n(r.quantity) - n((bud.get(s(r.line_key)) as R).quantity)) * n(r.list_price_inr),
    );
    expect(volMix).toBe(-5 * CR);
    const total =
      sum(lines('ACT_FY27'), (r) => n(r.net_amount_inr)) -
      sum(lines('BUD_FY27'), (r) => n(r.net_amount_inr));
    expect(total).toBe(-8 * CR);
  });
  it('planted volume ~ -4 Cr and mix ~ -1 Cr (within 5 lakh), IE units down about 12%', () => {
    const b = ds.golden.revenue_bridge_nov2026 as {
      volume: number;
      mix: number;
      price: number;
      timing: number;
      total: number;
      industrial_equipment_unit_decline_pct: number;
    };
    expect(Math.abs(b.volume + 4 * CR)).toBeLessThan(500_000);
    expect(Math.abs(b.mix + 1 * CR)).toBeLessThan(500_000);
    expect(b.volume + b.mix + b.price + b.timing).toBe(-8 * CR);
    expect(b.total).toBe(-8 * CR);
    expect(b.industrial_equipment_unit_decline_pct).toBeLessThan(-11.5);
    expect(b.industrial_equipment_unit_decline_pct).toBeGreaterThan(-12.6);
  });
  it('the two strategic deferring customers account for the largest unit drop', () => {
    const bud = new Map(lines('BUD_FY27').map((r) => [s(r.line_key), r]));
    const drop = new Map<string, number>();
    for (const r of lines('ACT_FY27').filter(
      (x) => x.bu_id === 'BU-IE' && x.delayed_to_period === null,
    )) {
      drop.set(
        s(r.customer_id),
        (drop.get(s(r.customer_id)) ?? 0) +
          n((bud.get(s(r.line_key)) as R).quantity) -
          n(r.quantity),
      );
    }
    const top2 = [...drop.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map((e) => e[0])
      .sort();
    expect(top2).toEqual(['C-EU-01', 'C-IN-01']);
  });
  it('sales lines tie to GL revenue by entity and BU, for budget and actual', () => {
    for (const [lv, gv] of [
      ['BUD_FY27', 'BUD_FY27'],
      ['ACT_FY27', 'ACT_FY27'],
    ] as const) {
      for (const e of t.dim_entity) {
        for (const b of t.dim_bu) {
          const a = sum(
            lines(lv).filter((r) => r.entity_id === e.entity_id && r.bu_id === b.bu_id),
            (r) => n(r.net_amount_inr),
          );
          const g = sum(
            t.fact_gl.filter(
              (r) =>
                r.version_id === gv &&
                r.period === '2026-11' &&
                r.entity_id === e.entity_id &&
                r.bu_id === b.bu_id &&
                s(r.account_id) < '5',
            ),
            (r) => n(r.amount_inr),
          );
          expect(a).toBe(g);
        }
      }
    }
  });
  it('budget list prices are multiples of 1,000 and gross = quantity x price', () => {
    for (const r of t.fact_sales_line) {
      expect(n(r.list_price_inr) % 1000).toBe(0);
      expect(n(r.gross_amount_inr)).toBe(n(r.quantity) * n(r.list_price_inr));
      expect(n(r.net_amount_inr)).toBe(n(r.gross_amount_inr) - n(r.discount_inr));
    }
  });
});

describe('full-year forecast story', () => {
  it('budget 1,200 -> previous forecast 1,200 -> latest forecast 1,150 Cr; prior year 1,115 Cr', () => {
    expect(gl('BUD_FY27', null, isRev)).toBe(1200 * CR);
    expect(gl('FC_FY27_OCT', null, isRev)).toBe(1200 * CR);
    expect(gl('FC_FY27_NOV', null, isRev)).toBe(1150 * CR);
    expect(gl('ACT_FY26', null, isRev)).toBe(1115 * CR);
  });
  it('forecast bridge: demand -25, FX -10, order delay -15, total -50 Cr', () => {
    const f = ds.golden.forecast_bridge as Record<string, number>;
    expect(f.DEMAND).toBe(-25 * CR);
    expect(f.FX).toBe(-10 * CR);
    expect(f.ORDER_DELAY).toBe(-15 * CR);
    expect(f.total).toBe(-50 * CR);
    expect(f.nov_actual_to_date).toBe(-8 * CR);
    expect(f.dec_to_mar).toBe(-42 * CR);
  });
  it('growth slows from ~8% to ~3% against prior year', () => {
    const g = (
      ds.golden.full_year_fy27 as {
        growth_vs_prior_year_pct: { forecast_oct: number; forecast_nov: number };
      }
    ).growth_vs_prior_year_pct;
    expect(g.forecast_oct).toBeGreaterThan(7);
    expect(g.forecast_nov).toBeLessThan(4);
  });
  it('every bridge cell reconciles to the GL difference between the two forecast versions', () => {
    const cell = (v: string, r: R): string => `${v}|${s(r.period)}|${s(r.entity_id)}|${s(r.bu_id)}`;
    const d = new Map<string, number>();
    for (const r of t.fact_gl.filter((x) => s(x.account_id) < '5')) {
      if (r.version_id === 'FC_FY27_NOV')
        d.set(cell('x', r), (d.get(cell('x', r)) ?? 0) + n(r.amount_inr));
      if (r.version_id === 'FC_FY27_OCT')
        d.set(cell('x', r), (d.get(cell('x', r)) ?? 0) - n(r.amount_inr));
    }
    const b = new Map<string, number>();
    for (const r of t.fact_forecast_bridge)
      b.set(cell('x', r), (b.get(cell('x', r)) ?? 0) + n(r.amount_inr));
    for (const [k, v] of d) expect(b.get(k) ?? 0).toBe(v);
    for (const [k, v] of b) expect(d.get(k) ?? 0).toBe(v);
  });
  it('forecast versions embed closed actuals; previous forecast Nov equals budget Nov', () => {
    for (const p of ['2026-04', '2026-07', '2026-10'])
      expect(gl('FC_FY27_OCT', p, () => true)).toBe(gl('ACT_FY27', p, () => true));
    for (const p of ['2026-04', '2026-11'])
      expect(gl('FC_FY27_NOV', p, () => true)).toBe(gl('ACT_FY27', p, () => true));
    expect(gl('FC_FY27_OCT', '2026-11', () => true)).toBe(gl('BUD_FY27', '2026-11', () => true));
  });
  it('planner overrides sit inside the DEMAND bridge for their cell', () => {
    for (const o of t.fact_planner_override) {
      const demand = sum(
        t.fact_forecast_bridge.filter(
          (r) =>
            r.driver === 'DEMAND' &&
            r.period === o.period &&
            r.entity_id === o.entity_id &&
            r.bu_id === o.bu_id,
        ),
        (r) => n(r.amount_inr),
      );
      expect(Math.abs(n(o.delta_inr))).toBeLessThanOrEqual(Math.abs(demand));
      expect(Math.sign(n(o.delta_inr))).toBe(Math.sign(demand));
    }
  });
  it('FX rates in the latest forecast are lower than budget (adverse translation)', () => {
    const rate = (v: string, c: string): number =>
      n(
        t.fx_rate.find((r) => r.version_id === v && r.period === '2027-01' && r.currency === c)
          ?.rate_inr,
      );
    expect(rate('FC_FY27_NOV', 'EUR')).toBeLessThan(rate('BUD_FY27', 'EUR'));
    expect(rate('FC_FY27_NOV', 'USD')).toBeLessThan(rate('BUD_FY27', 'USD'));
  });
});

describe('order book supports the narrative', () => {
  it('Nov-delayed orders total 1 Cr and match the delayed sales lines', () => {
    const o = t.fact_order_book.filter((r) => s(r.order_id).startsWith('SO-DL'));
    expect(sum(o, (r) => n(r.value_inr))).toBe(1 * CR);
    expect(o.every((r) => r.current_delivery_period === '2026-12')).toBe(true);
    const ids = t.fact_sales_line
      .filter((r) => r.delayed_to_period)
      .map((r) => s(r.order_id))
      .sort();
    expect(ids).toEqual(o.map((r) => s(r.order_id)).sort());
  });
  it('three strategic-customer orders worth 15 Cr moved from Dec 2026 to next financial year', () => {
    const o = t.fact_order_book.filter((r) => s(r.order_id).startsWith('SO-SL'));
    expect(o).toHaveLength(3);
    expect(sum(o, (r) => n(r.value_inr))).toBe(15 * CR);
    expect(
      o.every(
        (r) =>
          r.original_delivery_period === '2026-12' && s(r.current_delivery_period) >= '2027-04',
      ),
    ).toBe(true);
    const seg = new Map(t.dim_customer.map((c) => [c.customer_id, c.segment]));
    expect(o.every((r) => seg.get(s(r.customer_id)) === 'Strategic')).toBe(true);
  });
});

describe('sub-ledgers tie to the GL', () => {
  it('discretionary opex transactions equal GL actual Nov by entity and account', () => {
    for (const e of t.dim_entity) {
      for (const a of ['6200', '6300', '6400']) {
        const x = sum(
          t.fact_opex_txn.filter((r) => r.entity_id === e.entity_id && r.account_id === a),
          (r) => n(r.amount_inr),
        );
        const g = sum(
          t.fact_gl.filter(
            (r) =>
              r.version_id === 'ACT_FY27' &&
              r.period === '2026-11' &&
              r.entity_id === e.entity_id &&
              r.account_id === a,
          ),
          (r) => n(r.amount_inr),
        );
        expect(x).toBe(g);
      }
    }
  });
  it('headcount cost equals GL salaries by version, period and entity', () => {
    for (const r of t.fact_headcount.filter((x) => x.department === 'Sales')) {
      const total = sum(
        t.fact_headcount.filter(
          (x) =>
            x.version_id === r.version_id && x.period === r.period && x.entity_id === r.entity_id,
        ),
        (x) => n(x.cost_inr),
      );
      const g = sum(
        t.fact_gl.filter(
          (x) =>
            x.version_id === r.version_id &&
            x.period === r.period &&
            x.entity_id === r.entity_id &&
            x.account_id === '6100',
        ),
        (x) => n(x.amount_inr),
      );
      expect(total).toBe(g);
    }
  });
  it('supplier spend equals GL direct materials actual Nov by entity', () => {
    for (const e of t.dim_entity) {
      const x = sum(
        t.fact_supplier_spend.filter((r) => r.entity_id === e.entity_id),
        (r) => n(r.amount_inr),
      );
      expect(x).toBe(gl('ACT_FY27', '2026-11', (a) => a === '5000', e.entity_id as string));
    }
  });
  it('five suppliers are renegotiation candidates with alternatives available', () => {
    const c = t.dim_supplier.filter((r) => r.renegotiation_candidate);
    expect(c).toHaveLength(5);
    expect(c.every((r) => n(r.alt_sources) >= 1)).toBe(true);
  });
});

describe('opex overrun is a trend, not a one-off', () => {
  it('travel and consulting overrun versus budget widens every month from June to November', () => {
    for (const a of ['6200', '6300']) {
      const pct = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((p) => {
        const act = gl('ACT_FY27', p, (x) => x === a);
        const bud = gl('BUD_FY27', p, (x) => x === a);
        return (act - bud) / bud;
      });
      for (let i = 1; i < pct.length; i++)
        expect(pct[i] as number).toBeGreaterThan(pct[i - 1] as number);
    }
  });
});

describe('referential and structural integrity', () => {
  const keys = (rows: R[], k: string): Set<string> => new Set(rows.map((r) => s(r[k])));
  it('all foreign keys resolve', () => {
    const e = keys(t.dim_entity, 'entity_id'),
      b = keys(t.dim_bu, 'bu_id'),
      a = keys(t.dim_account, 'account_id');
    const p = keys(t.dim_period, 'period'),
      v = keys(t.dim_version, 'version_id'),
      c = keys(t.dim_customer, 'customer_id');
    const sk = keys(t.dim_product, 'sku_id'),
      su = keys(t.dim_supplier, 'supplier_id');
    for (const r of t.fact_gl) {
      expect(e.has(s(r.entity_id))).toBe(true);
      expect(b.has(s(r.bu_id))).toBe(true);
      expect(a.has(s(r.account_id))).toBe(true);
      expect(p.has(s(r.period))).toBe(true);
      expect(v.has(s(r.version_id))).toBe(true);
    }
    for (const r of t.fact_sales_line) {
      expect(c.has(s(r.customer_id))).toBe(true);
      expect(sk.has(s(r.sku_id))).toBe(true);
      expect(e.has(s(r.entity_id))).toBe(true);
    }
    for (const r of t.fact_order_book) {
      expect(c.has(s(r.customer_id))).toBe(true);
      expect(sk.has(s(r.sku_id))).toBe(true);
    }
    for (const r of t.fact_supplier_spend) expect(su.has(s(r.supplier_id))).toBe(true);
    for (const r of t.fact_forecast_bridge) {
      expect(e.has(s(r.entity_id))).toBe(true);
      expect(b.has(s(r.bu_id))).toBe(true);
    }
    for (const r of t.dim_customer) expect(e.has(s(r.entity_id))).toBe(true);
    for (const r of t.dim_product) expect(b.has(s(r.bu_id))).toBe(true);
  });
  it('GL has one row per version, period, entity, BU and account', () => {
    const seen = new Set<string>();
    for (const r of t.fact_gl) {
      const k = [r.version_id, r.period, r.entity_id, r.bu_id, r.account_id].join('|');
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
  it('no negative revenue or cost amounts anywhere in the GL', () => {
    expect(t.fact_gl.every((r) => n(r.amount_inr) >= 0)).toBe(true);
  });
  it('services BU books to 4100, all others to 4000', () => {
    for (const r of t.fact_gl.filter((x) => s(x.account_id) < '5'))
      expect(r.account_id).toBe(r.bu_id === 'BU-SV' ? '4100' : '4000');
  });
  it('corrective actions total 14.3 Cr gross, with ACT-003 overlapping ACT-001', () => {
    expect(sum(t.dim_action, (r) => n(r.potential_inr))).toBe(14.3 * CR);
    expect(t.dim_action.find((r) => r.action_id === 'ACT-003')?.overlaps_with).toBe('ACT-001');
  });
  it('dataset size is within expectations', () => {
    expect(t.fact_gl.length).toBeGreaterThan(10_000);
    expect(t.fact_sales_line.length).toBeGreaterThan(500);
  });
});
