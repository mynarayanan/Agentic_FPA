import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_FRAME, lineGeometry, waterfallGeometry } from '../lib/chart-geometry';
import type { WfItem } from '../lib/chart-geometry';

const F = DEFAULT_FRAME;
const bottom = F.height - F.bottom;

describe('waterfallGeometry', () => {
  const items: WfItem[] = [
    { label: 'Budget', value: 100, kind: 'total' },
    { label: 'Timing', value: -1, kind: 'delta' },
    { label: 'Price', value: -2, kind: 'delta' },
    { label: 'Actual', value: 97, kind: 'total' },
  ];
  const g = waterfallGeometry(items);
  it('one bar per item, left to right, with totals standing on the baseline', () => {
    expect(g.bars.map((b) => b.label)).toEqual(['Budget', 'Timing', 'Price', 'Actual']);
    expect(g.bars[0]!.x).toBeLessThan(g.bars[1]!.x);
    for (const b of g.bars.filter((x) => x.kind === 'total'))
      expect(b.y + b.h).toBeCloseTo(bottom, 6);
  });
  it('delta bars hang from the running level: each starts where the previous one ended', () => {
    expect(g.bars.map((b) => b.level)).toEqual([100, 99, 97, 97]);
    expect(g.bars[1]!.y).toBeCloseTo(g.connectors[0]!.y, 6); // a fall starts at the level the connector marks
    expect(g.bars[2]!.y).toBeCloseTo(g.connectors[1]!.y, 6);
    expect(g.connectors).toHaveLength(3);
  });
  it('colours by polarity: a fall in revenue is bad, a fall in cost is good, zero is flat', () => {
    expect(g.bars[1]!.tone).toBe('bad');
    const cost = waterfallGeometry([
      { label: 'a', value: 10, kind: 'total' },
      { label: 'b', value: -2, kind: 'delta', polarity: -1 },
      { label: 'c', value: 0, kind: 'delta' },
    ]);
    expect(cost.bars[1]!.tone).toBe('good');
    expect(cost.bars[2]!.tone).toBe('flat');
    expect(cost.bars[2]!.h).toBeGreaterThanOrEqual(1);
  });
  it('flags a truncated axis when totals are far from zero, so the chart can say so', () => {
    expect(g.truncated).toBe(true);
    expect(
      waterfallGeometry([
        { label: 'a', value: 5, kind: 'delta' },
        { label: 'b', value: -10, kind: 'delta' },
      ]).truncated,
    ).toBe(false);
  });
  it('handles a single flat value and empty ranges without NaN', () => {
    const one = waterfallGeometry([{ label: 'a', value: 0, kind: 'total' }]);
    for (const b of one.bars)
      for (const n of [b.x, b.y, b.w, b.h]) expect(Number.isFinite(n)).toBe(true);
  });
  it('property: every bar stays inside the plot, nothing is NaN, and the ticks span the domain', () => {
    const item = fc.record({
      value: fc.integer({ min: -1e6, max: 1e6 }),
      kind: fc.constantFrom<'total' | 'delta'>('total', 'delta'),
    });
    fc.assert(
      fc.property(fc.array(item, { minLength: 1, maxLength: 10 }), (xs) => {
        const geo = waterfallGeometry(
          xs.map((x, i) => ({ label: `i${i}`, value: x.value, kind: x.kind })),
        );
        for (const b of geo.bars) {
          for (const n of [b.x, b.y, b.w, b.h]) expect(Number.isFinite(n)).toBe(true);
          expect(b.y).toBeGreaterThanOrEqual(F.top - 1e-6);
          expect(b.y + b.h).toBeLessThanOrEqual(bottom + 1 + 1e-6);
          expect(b.x).toBeGreaterThanOrEqual(F.left);
          expect(b.x + b.w).toBeLessThanOrEqual(F.width - F.right);
        }
        expect(geo.yMax).toBeGreaterThan(geo.yMin);
      }),
    );
  });
});

describe('lineGeometry', () => {
  const labels = ['A', 'B', 'C', 'D'];
  const g = lineGeometry(
    [
      { name: 'one', values: [10, 20, 15, 30] },
      { name: 'two', values: [12, 12, 12, 12] },
    ],
    labels,
  );
  it('plots a point per value, higher values higher on the page', () => {
    expect(g.paths[0]!.points).toHaveLength(4);
    expect(g.paths[0]!.points[3]!.y).toBeLessThan(g.paths[0]!.points[0]!.y);
    expect(g.paths[0]!.d.startsWith('M')).toBe(true);
    expect(g.paths[1]!.points.every((p) => p.y === g.paths[1]!.points[0]!.y)).toBe(true);
  });
  it('spaces x evenly from the left to the right edge, and xAt agrees', () => {
    expect(g.xTicks.map((t) => t.label)).toEqual(labels);
    expect(g.xTicks[0]!.x).toBe(F.left);
    expect(g.xTicks[3]!.x).toBe(F.width - F.right);
    expect(g.xAt(1)).toBe(g.xTicks[1]!.x);
  });
  it('the domain contains every value, and a flat series still has a height', () => {
    expect(g.yMin).toBeLessThan(10);
    expect(g.yMax).toBeGreaterThan(30);
    const flat = lineGeometry([{ name: 'f', values: [5, 5] }], ['a', 'b']);
    expect(flat.yMax).toBeGreaterThan(flat.yMin);
  });
  it('a single label does not divide by zero', () => {
    const one = lineGeometry([{ name: 'f', values: [5] }], ['a']);
    expect(Number.isFinite(one.paths[0]!.points[0]!.x)).toBe(true);
  });
});
