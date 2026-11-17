import { describe, expect, it } from 'vitest';
import { allowedNumbers, buildFactSheet, formatFact, numbersIn } from '../src';
import type { Fact } from '../src';
import { novReport, novSheet } from './fixtures';

const fact = (value: number, unit: Fact['unit'] = 'inr', label = 'x'): Fact => ({
  id: 'F1',
  key: 'k',
  label,
  value,
  unit,
  basis: 'CALCULATED',
  calc_ref: 'R',
});
const CR = 10_000_000;

describe('fact sheet for the November 2026 scenario', () => {
  const sheet = novSheet();
  const get = (key: string) => sheet.facts.find((f) => f.key === key) as Fact;
  it('carries the CFO numbers from the engine', () => {
    expect(get('revenue.variance').value).toBe(-8 * CR);
    expect(formatFact(get('revenue.variance'))).toBe('-₹8.00 Cr');
    expect(formatFact(get('revenue.variance'), true)).toBe('₹8.00 Cr');
    expect(formatFact(get('opex.variance_pct'))).toBe('11.43%');
    expect(get('op.actual').value).toBe(8 * CR);
    expect(get('bridge.price').value).toBe(-2 * CR);
    expect(get('bridge.timing').value).toBe(-1 * CR);
    expect(get('bridge.total').value).toBe(-8 * CR);
  });
  it('marks ledger figures CONFIRMED and variances CALCULATED, with direction and favourability', () => {
    expect(get('revenue.actual').basis).toBe('CONFIRMED');
    expect(get('revenue.variance')).toMatchObject({
      basis: 'CALCULATED',
      direction: 'below budget',
      favourable: false,
    });
    expect(get('other_costs.variance')).toMatchObject({
      direction: 'below budget',
      favourable: true,
    });
  });
  it('names the biggest account variances and the Industrial Equipment unit decline', () => {
    expect(get('account.1').label).toBe('Direct Materials (5000) variance');
    expect(
      sheet.facts.some((f) => f.label === 'Consulting & Professional Fees (6300) variance'),
    ).toBe(true);
    expect(sheet.facts.some((f) => f.label.startsWith('Revenue - Product Sales'))).toBe(false);
    expect(sheet.facts.filter((f) => f.key.startsWith('account.'))).toHaveLength(5);
    expect(get('bridge.bu.BU-IE.units').value).toBeLessThan(-11);
    expect(get('bridge.bu.BU-IE.units').label).toBe(
      'Industrial Equipment delivered units versus budget',
    );
  });
  it('has unique sequential ids and a stable hash that changes with the numbers', () => {
    expect(sheet.facts.map((f) => f.id)).toEqual(sheet.facts.map((_, i) => `F${i + 1}`));
    expect(novSheet().hash).toBe(sheet.hash);
    const other = novReport();
    other.pnl.revenue.variance += 1;
    expect(buildFactSheet(other).hash).not.toBe(sheet.hash);
  });
  it('labels an entity slice and omits the bridge when there is no sales detail', () => {
    expect(buildFactSheet(novReport('E-IN')).entity_name).toBe('India Manufacturing');
    const noBridge = novReport();
    noBridge.revenue_bridge = null;
    noBridge.names = null;
    const s = buildFactSheet(noBridge);
    expect(s.facts.some((f) => f.key.startsWith('bridge.'))).toBe(false);
    expect(s.facts.find((f) => f.key === 'account.1')?.label).toMatch(/\(5000\)/);
  });
});

describe('formatting and allowed spellings', () => {
  it('shows no sign for a zero that rounds to nothing', () => {
    expect(formatFact(fact(-1))).toBe('₹0.00 Cr');
    expect(formatFact(fact(-250_000))).toBe('-₹0.03 Cr');
    expect(formatFact(fact(-8.5, 'pct'))).toBe('-8.50%');
  });
  it('allows the exact, trimmed and one-decimal spellings only', () => {
    expect([...allowedNumbers(fact(-8 * CR))].sort()).toEqual(['8', '8.0', '8.00']);
    expect([...allowedNumbers(fact(85_000_000))].sort()).toEqual(['8.5', '8.50']);
    expect([...allowedNumbers(fact(0))].sort()).toEqual(['0', '0.0', '0.00']);
    expect(allowedNumbers(fact(11.43, 'pct')).has('1143')).toBe(false);
  });
  it('includes digits that appear in the label, such as account ids', () => {
    expect(allowedNumbers(fact(CR, 'inr', 'Travel (6200) variance')).has('6200')).toBe(true);
  });
  it('numbersIn treats year-like amounts as amounts, but real dates as dates', () => {
    expect(numbersIn('opex rose 2099.90% to ₹2026 Cr, or 2026.00 Cr')).toEqual([
      '2099.90',
      '2026',
      '2026.00',
    ]);
    expect(numbersIn('In November 2026. Compared with 2025, up 1999%')).toEqual(['1999']);
    expect(numbersIn('2026 crore')).toEqual(['2026']);
  });
  it('numbersIn ignores periods, fiscal years, years and alphanumeric tags', () => {
    expect(
      numbersIn('In 2026-11 (FY27, Q3, 2026) revenue was ₹1,200.50 Cr, 11.43% and -3'),
    ).toEqual(['1200.50', '11.43', '3']);
  });
});
