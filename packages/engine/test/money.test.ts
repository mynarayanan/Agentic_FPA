import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CRORE, assertRupees, fromCrore, toCrore } from '../src';

describe('money', () => {
  it('converts crore to rupees exactly', () => {
    expect(fromCrore(1)).toBe(10_000_000);
    expect(fromCrore(0.8)).toBe(8_000_000);
    expect(fromCrore(1200)).toBe(12_000_000_000);
  });
  it('rejects non-integers', () => {
    expect(() => assertRupees(1.5)).toThrow(RangeError);
    expect(() => assertRupees(Number.NaN)).toThrow(RangeError);
    expect(() => assertRupees(2 ** 60)).toThrow(RangeError);
  });
  it('round-trips whole-lakh values', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (lakh) => {
        const rupees = lakh * 100_000;
        expect(fromCrore(toCrore(rupees, 5))).toBe(rupees);
      }),
    );
  });
  it('exposes CRORE constant', () => expect(CRORE).toBe(10_000_000));
});
