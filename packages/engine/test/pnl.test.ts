import { describe, expect, it } from 'vitest';
import { accountVariances, calcRegistry, pnl, pnlVariance } from '../src';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const accounts = [
  { account_id: '4000', type: 'REVENUE' as const },
  { account_id: '5000', type: 'COGS' as const },
  { account_id: '6000', type: 'OPEX' as const },
];
const r = (account_id: string, amount_inr: number) => ({ account_id, amount_inr });

describe('pnl', () => {
  it('computes operating profit from typed accounts', () => {
    expect(pnl([r('4000', 100), r('5000', 50), r('6000', 20)], accounts)).toEqual({
      revenue: 100,
      otherOperatingCosts: 50,
      opex: 20,
      operatingProfit: 30,
    });
  });
  it('rejects unknown accounts', () => {
    expect(() => pnl([r('9999', 1)], accounts)).toThrow(/unknown account/);
    expect(() => accountVariances([r('9999', 1)], [], accounts)).toThrow(/unknown account/);
    expect(() => accountVariances([], [r('9999', 1)], accounts)).toThrow(/unknown account/);
  });
  it('flags a cost reduction as favourable and a profit drop as adverse', () => {
    const v = pnlVariance(
      [r('4000', 90), r('5000', 40), r('6000', 20)],
      [r('4000', 100), r('5000', 50), r('6000', 20)],
      accounts,
    );
    expect(v.otherOperatingCosts.favourable).toBe(true);
    expect(v.operatingProfit).toMatchObject({ variance: 0, favourable: true });
    expect(v.revenue.favourable).toBe(false);
  });
  it('orders account variances by size, ties by account id, and handles zero budgets', () => {
    const out = accountVariances(
      [r('4000', 10), r('6000', 10), r('5000', 7)],
      [r('4000', 0), r('6000', 0), r('5000', 7)],
      accounts,
    );
    expect(out.map((x) => x.account_id)).toEqual(['4000', '6000', '5000']);
    expect(out[0]?.variance_bps).toBeNull();
  });
});

describe('registry documentation', () => {
  it('every calc methodologyRef points at a heading in docs/methodology.md', () => {
    const md = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'methodology.md'), 'utf8');
    const slugs = md
      .split('\n')
      .filter((l) => l.startsWith('#'))
      .map((l) =>
        l
          .replace(/^#+\s*/, '')
          .toLowerCase()
          .replace(/[^a-z0-9 -]/g, '')
          .trim()
          .replace(/\s+/g, '-'),
      );
    for (const c of calcRegistry) expect(slugs, c.id).toContain(c.methodologyRef.split('#')[1]);
  });
});
