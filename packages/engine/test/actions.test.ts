import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_ASSESSMENT_PARAMS, assessActions, periodFromIndex, periodIndex } from '../src';
import type { ActionInput } from '../src';
import { loadTable } from './fixtures';

const CR = 10_000_000;
const act = (o: Partial<ActionInput> = {}): ActionInput => ({
  action_id: 'A',
  title: 't',
  kind: 'RECURRING_SAVING',
  potential_inr: CR,
  timeline_days: 30,
  implementation_cost_inr: 0,
  overlaps_with: null,
  confidence: 'HIGH',
  ...o,
});
const library = loadTable('dim_action') as ActionInput[];

describe('assessActions on the synthetic action library (hand-worked)', () => {
  const r = assessActions(library, -7 * CR);
  const by = (id: string) =>
    r.actions.find((a) => a.action_id === id) as NonNullable<(typeof r.actions)[number]>;
  it('ACT-001 order recovery: 10 Cr revenue = 3.6 Cr profit, x70% = 2.52, full phasing, less 0.25 cost = 2.27 Cr', () => {
    expect(by('ACT-001')).toMatchObject({
      revenue_impact_inr: 10 * CR,
      profit_gross_inr: 3.6 * CR,
      risk_adjusted_profit_inr: 2.52 * CR,
      phasing_bps: 10_000,
      in_year_profit_inr: 2.52 * CR,
      net_in_year_profit_inr: 2.27 * CR,
      incremental: false,
    });
  });
  it('ACT-002 discretionary spend: 1.5 x 90% = 1.35, starts Feb so 50% = 0.675, less 0.05 = 0.625 Cr', () => {
    expect(by('ACT-002')).toMatchObject({
      benefit_start_period: '2027-02',
      phasing_bps: 5000,
      in_year_profit_inr: 6_750_000,
      net_in_year_profit_inr: 6_250_000,
      incremental: true,
      recurring: true,
    });
  });
  it('ACT-003 mix gives up half its profit because it overlaps ACT-001', () => {
    expect(by('ACT-003')).toMatchObject({
      overlap_haircut_inr: 1 * CR,
      risk_adjusted_profit_inr: 7_000_000,
      phasing_bps: 7500,
      in_year_profit_inr: 5_250_000,
      net_in_year_profit_inr: 4_250_000,
    });
    expect(by('ACT-003').notes.join(' ')).toContain('Overlaps ACT-001');
  });
  it('ACT-004 procurement: 0.8 x 70% = 0.56, 50% phasing = 0.28, less 0.1 = 0.18 Cr', () => {
    expect(by('ACT-004').net_in_year_profit_inr).toBe(1_800_000);
  });
  it('the 14.3 Cr headline becomes about 3.5 Cr of in-year profit, covering half of the 7 Cr gap', () => {
    expect(r.totals.gross_inr).toBe(14.3 * CR);
    expect(r.totals.revenue_impact_inr).toBe(10 * CR);
    expect(r.totals.net_in_year_profit_inr).toBe(3.5 * CR);
    expect(r.gap_inr).toBe(7 * CR);
    expect(r.gap_coverage_bps).toBe(5000);
  });
  it('ranks by net in-year profit', () => {
    expect(r.actions.map((a) => a.action_id)).toEqual(['ACT-001', 'ACT-002', 'ACT-003', 'ACT-004']);
  });
  it('the default timing margin equals the Industrial Equipment 300 standard margin in the product master', () => {
    const margin = loadTable('dim_product').find((p) => p.sku_id === 'IE-300')?.std_margin_bps;
    expect(DEFAULT_ASSESSMENT_PARAMS.timingMarginBps).toBe(margin);
  });
});

describe('assessActions edge cases', () => {
  it('reports no coverage when there is no gap', () => {
    const r = assessActions([act()], 5 * CR);
    expect(r.gap_inr).toBe(0);
    expect(r.gap_coverage_bps).toBeNull();
  });
  it('clamps phasing: immediate actions get 100%, late ones 0%, and a closed horizon gives 0', () => {
    expect(assessActions([act({ timeline_days: 0 })], 0).actions[0]?.phasing_bps).toBe(10_000);
    expect(assessActions([act({ timeline_days: 400 })], 0).actions[0]).toMatchObject({
      phasing_bps: 0,
      in_year_profit_inr: 0,
    });
    const closed = { ...DEFAULT_ASSESSMENT_PARAMS, decisionPeriod: '2027-03' };
    expect(assessActions([act()], 0, closed).actions[0]?.phasing_bps).toBe(0);
  });
  it('can show a negative net when implementation cost exceeds the in-year benefit', () => {
    expect(
      assessActions([act({ potential_inr: 100, implementation_cost_inr: CR })], 0).actions[0]
        ?.net_in_year_profit_inr,
    ).toBeLessThan(0);
  });
  it('ignores overlaps that are unknown or self-referencing, with a note', () => {
    const r = assessActions(
      [act({ overlaps_with: 'ZZZ' }), act({ action_id: 'B', overlaps_with: 'B' })],
      0,
    );
    expect(r.totals.overlap_haircut_inr).toBe(0);
    expect(r.actions[0]?.notes.join(' ')).toContain('not in this portfolio');
  });
  it('labels one-off and one-time actions as non-recurring', () => {
    expect(assessActions([act({ kind: 'ONE_OFF_SAVING' })], 0).actions[0]).toMatchObject({
      recurring: false,
    });
    expect(
      assessActions([act({ kind: 'ONE_OFF_SAVING' })], 0).actions[0]?.notes.join(' '),
    ).toContain('One-off');
  });
  it('rejects invalid inputs', () => {
    expect(() => assessActions([act(), act()], 0)).toThrow(/duplicate/);
    expect(() => assessActions([act({ potential_inr: -1 })], 0)).toThrow(RangeError);
    expect(() => assessActions([act({ implementation_cost_inr: -1 })], 0)).toThrow(RangeError);
    expect(() => assessActions([act({ potential_inr: 1.5 })], 0)).toThrow(RangeError);
    expect(() => assessActions([act({ timeline_days: -1 })], 0)).toThrow(RangeError);
    expect(() => assessActions([act({ confidence: 'X' as never })], 0)).toThrow(/confidence/);
    expect(() => assessActions([act()], 1.5)).toThrow(RangeError);
  });
  it('period helpers round-trip and reject bad input', () => {
    expect(periodFromIndex(periodIndex('2026-12') + 1)).toBe('2027-01');
    expect(() => periodIndex('2026-13')).toThrow(RangeError);
  });
});

describe('assessActions properties', () => {
  const arb = fc.record({
    kind: fc.constantFrom(
      'TIMING_RECOVERY',
      'RECURRING_SAVING',
      'RECURRING_MARGIN',
      'ONE_OFF_SAVING' as const,
    ),
    potential_inr: fc.integer({ min: 0, max: 50 * CR }),
    timeline_days: fc.integer({ min: 0, max: 200 }),
    implementation_cost_inr: fc.integer({ min: 0, max: 2 * CR }),
    confidence: fc.constantFrom('LOW', 'MEDIUM', 'HIGH' as const),
    overlap: fc.boolean(),
  });
  it('every step only ever reduces the benefit, and the totals equal the sum of the parts', () => {
    fc.assert(
      fc.property(
        fc.array(arb, { minLength: 1, maxLength: 8 }),
        fc.integer({ min: -20 * CR, max: 5 * CR }),
        (items, gap) => {
          const actions = items.map((x, i) =>
            act({
              action_id: `A${i}`,
              kind: x.kind as ActionInput['kind'],
              potential_inr: x.potential_inr,
              timeline_days: x.timeline_days,
              implementation_cost_inr: x.implementation_cost_inr,
              confidence: x.confidence as ActionInput['confidence'],
              overlaps_with: x.overlap && i > 0 ? 'A0' : null,
            }),
          );
          const r = assessActions(actions, gap);
          for (const a of r.actions) {
            expect(a.overlap_haircut_inr).toBeLessThanOrEqual(a.profit_gross_inr);
            expect(a.risk_adjusted_profit_inr).toBeLessThanOrEqual(
              a.profit_gross_inr - a.overlap_haircut_inr,
            );
            expect(a.in_year_profit_inr).toBeLessThanOrEqual(a.risk_adjusted_profit_inr);
            expect(a.net_in_year_profit_inr).toBe(a.in_year_profit_inr - a.implementation_cost_inr);
            expect(a.phasing_bps).toBeGreaterThanOrEqual(0);
            expect(a.phasing_bps).toBeLessThanOrEqual(10_000);
          }
          expect(r.totals.net_in_year_profit_inr).toBe(
            r.actions.reduce((s, a) => s + a.net_in_year_profit_inr, 0),
          );
          expect(r.totals.gross_inr).toBe(actions.reduce((s, a) => s + a.potential_inr, 0));
        },
      ),
    );
  });
  it('higher confidence never lowers the risk-adjusted benefit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 * CR }), (p) => {
        const v = (c: ActionInput['confidence']) =>
          assessActions([act({ potential_inr: p, confidence: c })], 0).actions[0]
            ?.risk_adjusted_profit_inr as number;
        expect(v('LOW')).toBeLessThanOrEqual(v('MEDIUM'));
        expect(v('MEDIUM')).toBeLessThanOrEqual(v('HIGH'));
      }),
    );
  });
});
