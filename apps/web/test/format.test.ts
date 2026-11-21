import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatFact } from '@fpa/narrative';
import type { Fact } from '@fpa/narrative';
import { crNumber, fmtBps, fmtCr, fmtFact, monthLabel, monthShort, tone } from '../lib/format';

const CR = 10_000_000;
const fact = (value: number, unit: Fact['unit']): Fact => ({
  id: 'F1',
  key: 'k',
  label: 'x',
  value,
  unit,
  basis: 'CALCULATED',
  calc_ref: 'R',
});

describe('formatting', () => {
  it('formats money in crore with the sign in front of the rupee symbol', () => {
    expect(fmtCr(92 * CR)).toBe('₹92.00 Cr');
    expect(fmtCr(-8 * CR)).toBe('-₹8.00 Cr');
    expect(fmtCr(-8 * CR, { abs: true })).toBe('₹8.00 Cr');
    expect(fmtCr(5 * CR, { signed: true })).toBe('+₹5.00 Cr');
    expect(fmtCr(-1)).toBe('₹0.00 Cr');
    expect(fmtCr(1, { signed: true })).toBe('₹0.00 Cr');
  });
  it('formats basis points as percentages, null as n/a', () => {
    expect(fmtBps(1143)).toBe('11.43%');
    expect(fmtBps(-800, { signed: true })).toBe('-8.00%');
    expect(fmtBps(417, { signed: true })).toBe('+4.17%');
    expect(fmtBps(-417, { abs: true })).toBe('4.17%');
    expect(fmtBps(0, { signed: true })).toBe('0.00%');
    expect(fmtBps(null)).toBe('n/a');
  });
  it('labels months and handles unexpected input', () => {
    expect(monthLabel('2026-11')).toBe('Nov 2026');
    expect(monthShort('2027-03')).toBe('Mar');
    expect(monthLabel('garbage')).toBe('garbage');
    expect(monthShort('garbage')).toBe('garbage');
  });
  it('crNumber gives a plain number for chart labels', () => {
    expect(crNumber(-3.97 * CR)).toBe('-3.97');
    expect(crNumber(1200 * CR, 0)).toBe('1200');
  });
  it('tone says whether a variance is good: income above plan, cost below plan', () => {
    expect(tone(1, 'income')).toBe('good');
    expect(tone(-1, 'income')).toBe('bad');
    expect(tone(1, 'cost')).toBe('bad');
    expect(tone(-1, 'cost')).toBe('good');
    expect(tone(0, 'cost')).toBe('neutral');
  });
  it('property: the UI formatter never disagrees with the narrative formatter', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5e11, max: 5e11 }), fc.boolean(), (v, abs) => {
        expect(fmtFact(fact(v, 'inr'), abs)).toBe(formatFact(fact(v, 'inr'), abs));
        expect(fmtFact(fact(v / 100, 'pct'), abs)).toBe(formatFact(fact(v / 100, 'pct'), abs));
      }),
    );
  });
});
