import { allocate } from './allocate';
import { revenueBridge } from './bridge';
import { accountVariances, pnl } from './pnl';
import { isFavourable, revenueVariance } from './variance';

export interface CalcSpec {
  id: string;
  name: string;
  formula: string;
  inputs: string[];
  version: string;
  methodologyRef: string;
  fn: (...args: never[]) => unknown;
}

/** Single source of truth for calculation IDs. docs/calc-registry.md is generated from this. */
export const calcRegistry: readonly CalcSpec[] = [
  {
    id: 'VAR-REV-001',
    name: 'Revenue variance',
    formula: 'actual_revenue - budget_revenue',
    inputs: ['actual_revenue (INR)', 'budget_revenue (INR)'],
    version: '1.0.0',
    methodologyRef: 'docs/methodology.md#revenue-variance',
    fn: revenueVariance,
  },
  {
    id: 'VAR-FAV-001',
    name: 'Variance favourability',
    formula: 'REVENUE: variance >= 0; COGS/OPEX: variance <= 0',
    inputs: ['account_type', 'variance (INR)'],
    version: '1.0.0',
    methodologyRef: 'docs/methodology.md#favourability',
    fn: isFavourable,
  },
  {
    id: 'VAR-REV-002',
    name: 'Revenue bridge (timing, price, volume, mix)',
    formula: 'timing + price + volume + mix = actual_revenue - budget_revenue',
    inputs: ['budget sales lines', 'actual sales lines (matched on line_key)'],
    version: '1.0.0',
    methodologyRef: 'docs/methodology.md#revenue-bridge',
    fn: revenueBridge,
  },
  {
    id: 'VAR-PNL-001',
    name: 'Operating profit',
    formula: 'revenue - other_operating_costs - operating_expenses',
    inputs: ['GL rows (one version and period selection)', 'account types'],
    version: '1.0.0',
    methodologyRef: 'docs/methodology.md#operating-profit',
    fn: pnl,
  },
  {
    id: 'VAR-OPX-001',
    name: 'Variance by account',
    formula: 'actual - budget per account; bps = round(variance / budget x 10000)',
    inputs: ['actual GL rows', 'budget GL rows', 'account types'],
    version: '1.0.0',
    methodologyRef: 'docs/methodology.md#variance-by-account',
    fn: accountVariances,
  },
  {
    id: 'ALC-INT-001',
    name: 'Exact integer allocation',
    formula:
      'largest-remainder split of an integer total across weights; parts sum exactly to the total',
    inputs: ['total (INR)', 'weights'],
    version: '1.0.0',
    methodologyRef: 'docs/methodology.md#allocation',
    fn: allocate,
  },
];
