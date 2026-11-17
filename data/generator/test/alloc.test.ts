import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allocate, allocateCapped } from '../src/alloc';

describe('allocate (largest remainder)', () => {
  it('always sums exactly to the total, for any sign', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -2_000_000_000, max: 2_000_000_000 }),
        fc.array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 30 }),
        (total, w) => {
          const parts = allocate(total, w);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        },
      ),
    );
  });
  it('is proportional within one unit', () => {
    const parts = allocate(1000, [1, 1, 2]);
    expect(parts).toEqual([250, 250, 500]);
  });
  it('rejects all-zero weights for a non-zero total', () =>
    expect(() => allocate(5, [0, 0])).toThrow());
});

describe('allocateCapped', () => {
  it('respects caps and sums to the total', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 1000 })), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (items, frac) => {
          const caps = items.map((i) => i[1]);
          const capTotal = caps.reduce((a, b) => a + b, 0);
          const total = Math.floor(capTotal * frac);
          const out = allocateCapped(
            total,
            items.map((i) => i[0]),
            caps,
          );
          expect(out.reduce((a, b) => a + b, 0)).toBe(total);
          out.forEach((v, i) => expect(v).toBeLessThanOrEqual(caps[i] as number));
        },
      ),
    );
  });
  it('throws when caps cannot hold the total', () =>
    expect(() => allocateCapped(10, [1], [5])).toThrow());
});
