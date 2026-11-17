import { assertRupees } from './money';
import type { Rupees } from './money';

export type AccountType = 'REVENUE' | 'COGS' | 'OPEX';

/** VAR-REV-001 - Revenue variance = Actual revenue - Budget revenue (negative = shortfall). */
export function revenueVariance(actual: Rupees, budget: Rupees): Rupees {
  assertRupees(actual, 'actual');
  assertRupees(budget, 'budget');
  return actual - budget;
}

/** VAR-FAV-001 - Revenue above plan is favourable; cost above plan is unfavourable. */
export function isFavourable(type: AccountType, variance: Rupees): boolean {
  assertRupees(variance, 'variance');
  return type === 'REVENUE' ? variance >= 0 : variance <= 0;
}
