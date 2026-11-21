import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calcRegistry, fromCrore, isFavourable, revenueVariance } from '../src';

describe('VAR-REV-001 revenue variance', () => {
  it('matches the November 2026 headline: 92 Cr vs 100 Cr = -8 Cr', () => {
    expect(revenueVariance(fromCrore(92), fromCrore(100))).toBe(fromCrore(-8));
  });
  it('is zero when actual equals budget', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1e12 }), (x) => revenueVariance(x, x) === 0));
  });
  it('is antisymmetric', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e12 }), fc.integer({ min: 0, max: 1e12 }), (a, b) => {
        expect(revenueVariance(a, b)).toBe(0 - revenueVariance(b, a));
      }),
    );
  });
  it('rejects fractional rupees', () => expect(() => revenueVariance(1.5, 1)).toThrow());
});

describe('VAR-FAV-001 favourability', () => {
  it('treats revenue shortfall and cost overrun as unfavourable', () => {
    expect(isFavourable('REVENUE', -1)).toBe(false);
    expect(isFavourable('OPEX', 1)).toBe(false);
    expect(isFavourable('COGS', -1)).toBe(true);
    expect(isFavourable('REVENUE', 0)).toBe(true);
  });
});

describe('calc registry', () => {
  it('has unique, well-formed IDs and a methodology reference', () => {
    const ids = calcRegistry.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of calcRegistry) {
      expect(c.id).toMatch(/^[A-Z]{3}-[A-Z]{3}-\d{3}$/);
      expect(c.methodologyRef).toMatch(/^docs\/methodology\.md#/);
      expect(typeof c.fn).toBe('function');
    }
  });
});
