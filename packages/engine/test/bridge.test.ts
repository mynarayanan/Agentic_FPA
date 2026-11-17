import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allocate, bridgeForEntity, revenueBridge, roundDiv } from '../src';
import type { SalesLineInput } from '../src';

const mk = (key: string, p: Partial<SalesLineInput> = {}): SalesLineInput => ({
  line_key: key,
  entity_id: 'E-A',
  bu_id: 'BU-1',
  quantity: 10,
  list_price_inr: 1000,
  discount_inr: 0,
  net_amount_inr: 10_000,
  delayed_to_period: null,
  ...p,
});
const actual = (
  b: SalesLineInput,
  q: number,
  disc = 0,
  delayed: string | null = null,
): SalesLineInput => ({
  ...b,
  quantity: q,
  discount_inr: disc,
  net_amount_inr: q * b.list_price_inr - disc,
  delayed_to_period: delayed,
});

describe('revenueBridge unit cases', () => {
  it('splits a hand-worked example', () => {
    // Budget: A 10 @1000 and B 10 @3000. Actual: A 5, B 12 (volume+mix), B discounted 600, C delayed.
    const A = mk('A');
    const B = mk('B', { list_price_inr: 3000, net_amount_inr: 30_000 });
    const C = mk('C', { list_price_inr: 5000, net_amount_inr: 5000, quantity: 1 });
    const r = revenueBridge(
      [A, B, C],
      [actual(A, 5), actual(B, 12, 600), actual(C, 0, 0, '2027-01')],
    );
    expect(r.timing).toBe(-5000);
    expect(r.price).toBe(-600);
    // volume+mix = (5-10)*1000 + (12-10)*3000 = 1000; pure volume = dq(-3) x avg budget price (40000/20 = 2000) = -6000; mix = 7000
    expect(r.volume).toBe(-6000);
    expect(r.mix).toBe(7000);
    expect(r.total).toBe(r.actual - r.budget);
    expect(r.total).toBe(-5000 - 600 + 1000);
  });
  it('is all zeros when actual equals budget', () => {
    const A = mk('A');
    const r = revenueBridge([A], [A]);
    expect(r).toMatchObject({ timing: 0, price: 0, volume: 0, mix: 0, total: 0 });
  });
  it('reports pure mix when units are unchanged but the SKU split shifts', () => {
    const A = mk('A');
    const B = mk('B', { list_price_inr: 3000, net_amount_inr: 30_000 });
    const r = revenueBridge([A, B], [actual(A, 15), actual(B, 5)]);
    expect(r.volume).toBe(0);
    expect(r.mix).toBe(-10_000);
  });
  it('rejects unmatched, duplicate or re-homed lines', () => {
    const A = mk('A');
    expect(() => revenueBridge([A], [])).toThrow(/no actual/);
    expect(() => revenueBridge([], [A])).toThrow(/no budget/);
    expect(() => revenueBridge([A, A], [A])).toThrow(/duplicate budget/);
    expect(() => revenueBridge([A], [A, A])).toThrow(/duplicate actual/);
    expect(() => revenueBridge([A], [{ ...A, bu_id: 'BU-2' }])).toThrow(/changed entity or BU/);
    expect(() => revenueBridge([A], [{ ...A, quantity: 1.5 }])).toThrow(RangeError);
  });
  it('falls back to budget-revenue weights when entity effects cancel exactly', () => {
    const A = mk('A', { entity_id: 'E-A' });
    const B = mk('B', { entity_id: 'E-B' });
    // dq = +1 -1... use different prices so BU dq != 0 while entity dv sum zero per entity is impossible; force: A +2 units @1000, B -1 unit @2000 => dv 2000 and -2000, dq +1
    const B2 = { ...B, list_price_inr: 2000, net_amount_inr: 20_000 };
    const r = revenueBridge([A, B2], [actual(A, 12), actual(B2, 9)]);
    expect(r.volume).toBe(Math.round((1 * 30_000) / 20));
    expect(r.cells.reduce((s, c) => s + c.volume, 0)).toBe(r.volume);
    expect(r.total).toBe(r.actual - r.budget);
  });
});

describe('bridgeForEntity', () => {
  const A = mk('A', { entity_id: 'E-A' });
  const B = mk('B', { entity_id: 'E-B', list_price_inr: 3000, net_amount_inr: 30_000 });
  const C = mk('C', { entity_id: 'E-A', bu_id: 'BU-2' });
  const group = revenueBridge(
    [A, B, C],
    [actual(A, 5, 100), actual(B, 14), actual(C, 0, 0, '2027-01')],
  );
  it('returns a reconciling slice with its own budget and actual', () => {
    const s = bridgeForEntity(group, 'E-A');
    expect(s.cells.every((c) => c.entity_id === 'E-A')).toBe(true);
    expect(s.total).toBe(s.actual - s.budget);
    expect(s.byBu.map((x) => x.bu_id)).toEqual(['BU-1', 'BU-2']);
    expect(s.byBu[0]?.unit_change_bps).toBe(-5000);
  });
  it('slices of every entity add up to the group, even where pure volume is rounded', () => {
    const parts = ['E-A', 'E-B'].map((e) => bridgeForEntity(group, e));
    for (const k of ['budget', 'actual', 'timing', 'price', 'volume', 'mix', 'total'] as const) {
      expect(
        parts.reduce((s, p) => s + p[k], 0),
        k,
      ).toBe(group[k]);
    }
  });
  it('is empty for an unknown entity and reports null unit change without budget units', () => {
    const e = bridgeForEntity(group, 'E-Z');
    expect(e).toMatchObject({ budget: 0, actual: 0, total: 0, cells: [], byBu: [] });
    const onlyDelayed = revenueBridge([A], [actual(A, 0, 0, '2027-01')]);
    expect(bridgeForEntity(onlyDelayed, 'E-A').byBu).toEqual([
      { bu_id: 'BU-1', volume: 0, mix: 0, unit_change_bps: null },
    ]);
  });
  it('property: slices always add up to the whole', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            e: fc.constantFrom('E-A', 'E-B', 'E-C'),
            bu: fc.constantFrom('BU-1', 'BU-2'),
            p: fc.integer({ min: 1, max: 99 }),
            qb: fc.integer({ min: 0, max: 50 }),
            qa: fc.integer({ min: 0, max: 80 }),
          }),
          { minLength: 1, maxLength: 25 },
        ),
        (items) => {
          const bud = items.map((x, i) =>
            mk(`P${i}`, {
              entity_id: x.e,
              bu_id: x.bu,
              list_price_inr: x.p * 1000,
              quantity: x.qb,
              net_amount_inr: x.qb * x.p * 1000,
            }),
          );
          const act = bud.map((b, i) => actual(b, (items[i] as { qa: number }).qa));
          const g = revenueBridge(bud, act);
          const parts = ['E-A', 'E-B', 'E-C'].map((e) => bridgeForEntity(g, e));
          for (const k of ['timing', 'price', 'volume', 'mix', 'total'] as const)
            expect(parts.reduce((s, x) => s + x[k], 0)).toBe(g[k]);
        },
      ),
    );
  });
});

describe('revenueBridge properties', () => {
  const lineArb = fc.record({
    entity: fc.constantFrom('E-A', 'E-B', 'E-C'),
    bu: fc.constantFrom('BU-1', 'BU-2', 'BU-3'),
    price: fc.integer({ min: 1, max: 500 }).map((x) => x * 1000),
    qb: fc.integer({ min: 0, max: 200 }),
    qa: fc.integer({ min: 0, max: 300 }),
    discPct: fc.integer({ min: 0, max: 20 }),
    delayed: fc.boolean(),
  });
  const build = (
    items: Array<{
      entity: string;
      bu: string;
      price: number;
      qb: number;
      qa: number;
      discPct: number;
      delayed: boolean;
    }>,
  ) => {
    const bud = items.map((x, i) =>
      mk(`L${i}`, {
        entity_id: x.entity,
        bu_id: x.bu,
        list_price_inr: x.price,
        quantity: x.qb,
        net_amount_inr: x.qb * x.price,
      }),
    );
    const act = items.map((x, i) => {
      const b = bud[i] as SalesLineInput;
      if (x.delayed) return actual(b, 0, 0, '2099-01');
      const gross = x.qa * x.price;
      return actual(b, x.qa, Math.floor((gross * x.discPct) / 100));
    });
    return { bud, act };
  };
  it('the four effects always sum exactly to actual - budget, in total, by cell and by BU', () => {
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 1, maxLength: 40 }), (items) => {
        const { bud, act } = build(items);
        const r = revenueBridge(bud, act);
        expect(r.total).toBe(r.actual - r.budget);
        expect(r.timing + r.price + r.volume + r.mix).toBe(r.total);
        expect(r.cells.reduce((s, c) => s + c.total, 0)).toBe(r.total);
        for (const bu of r.byBu)
          expect(
            r.cells.filter((c) => c.bu_id === bu.bu_id).reduce((s, c) => s + c.volume, 0),
          ).toBe(bu.volume);
        for (const bu of r.byBu)
          expect(r.cells.filter((c) => c.bu_id === bu.bu_id).reduce((s, c) => s + c.mix, 0)).toBe(
            bu.mix,
          );
      }),
    );
  });
  it('delayed lines only ever affect timing', () => {
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 1, maxLength: 20 }), (items) => {
        const allDelayed = items.map((x) => ({ ...x, delayed: true }));
        const { bud, act } = build(allDelayed);
        const r = revenueBridge(bud, act);
        expect([r.price, r.volume, r.mix]).toEqual([0, 0, 0]);
        expect(r.timing).toBe(0 - r.budget);
      }),
    );
  });
  it('no discounts and unchanged units mean zero price and volume', () => {
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 1, maxLength: 20 }), (items) => {
        const same = items.map((x) => ({ ...x, qa: x.qb, discPct: 0, delayed: false }));
        const { bud, act } = build(same);
        expect(revenueBridge(bud, act)).toMatchObject({
          price: 0,
          volume: 0,
          mix: 0,
          timing: 0,
          total: 0,
        });
      }),
    );
  });
});

describe('allocate and roundDiv', () => {
  it('allocate sums exactly for any sign', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.array(fc.integer({ min: 1, max: 1e6 }), { minLength: 1, maxLength: 20 }),
        (t, w) => {
          expect(allocate(t, w).reduce((a, b) => a + b, 0)).toBe(t);
        },
      ),
    );
  });
  it('allocate edge cases', () => {
    expect(allocate(0, [0, 0])).toEqual([0, 0]);
    expect(() => allocate(1, [0])).toThrow();
    expect(() => allocate(1, [])).toThrow();
    expect(() => allocate(1.5, [1])).toThrow(RangeError);
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });
  it('roundDiv rounds half up for positives and negatives', () => {
    expect(roundDiv(5n, 2n)).toBe(3);
    expect(roundDiv(-5n, 2n)).toBe(-2);
    expect(roundDiv(-7n, 2n)).toBe(-3);
    expect(roundDiv(7n, 3n)).toBe(2);
    expect(() => roundDiv(1n, 0n)).toThrow();
  });
});
