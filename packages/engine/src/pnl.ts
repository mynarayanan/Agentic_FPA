import { roundDiv } from './allocate';
import type { Rupees } from './money';
import type { AccountType } from './variance';
import { isFavourable } from './variance';

export interface GlRowInput {
  account_id: string;
  amount_inr: number;
}
export interface AccountInput {
  account_id: string;
  type: AccountType;
  name?: string;
}
export interface Pnl {
  revenue: Rupees;
  otherOperatingCosts: Rupees;
  opex: Rupees;
  operatingProfit: Rupees;
}
export interface Triple {
  budget: Rupees;
  actual: Rupees;
  variance: Rupees;
  /** Variance as basis points of budget; null when budget is zero. */
  variance_bps: number | null;
  favourable: boolean;
}
export interface PnlVariance {
  revenue: Triple;
  otherOperatingCosts: Triple;
  opex: Triple;
  operatingProfit: Triple;
}
export interface AccountVariance extends Triple {
  account_id: string;
  type: AccountType;
  name?: string;
}

/** Basis points of variance over budget, rounded half up. Null when budget is zero. */
export function varianceBps(variance: Rupees, budget: Rupees): number | null {
  if (budget === 0) return null;
  const sign = budget < 0 ? -1n : 1n;
  return roundDiv(sign * BigInt(variance) * 10000n, sign * BigInt(budget));
}

const typeMap = (accounts: AccountInput[]): Map<string, AccountType> =>
  new Map(accounts.map((a) => [a.account_id, a.type]));
const nameMap = (accounts: AccountInput[]): Map<string, string | undefined> =>
  new Map(accounts.map((a) => [a.account_id, a.name]));

/** VAR-PNL-001 - Operating profit = revenue - other operating costs - operating expenses. Rows must be pre-filtered to one version and period selection. */
export function pnl(rows: GlRowInput[], accounts: AccountInput[]): Pnl {
  const types = typeMap(accounts);
  const t = { REVENUE: 0, COGS: 0, OPEX: 0 };
  for (const r of rows) {
    const type = types.get(r.account_id);
    if (!type) throw new Error(`unknown account ${r.account_id}`);
    t[type] += r.amount_inr;
  }
  return {
    revenue: t.REVENUE,
    otherOperatingCosts: t.COGS,
    opex: t.OPEX,
    operatingProfit: t.REVENUE - t.COGS - t.OPEX,
  };
}

function triple(type: AccountType, budget: Rupees, actual: Rupees): Triple {
  const variance = actual - budget;
  return {
    budget,
    actual,
    variance,
    variance_bps: varianceBps(variance, budget),
    favourable: isFavourable(type, variance),
  };
}

export function pnlVariance(
  actualRows: GlRowInput[],
  budgetRows: GlRowInput[],
  accounts: AccountInput[],
): PnlVariance {
  const a = pnl(actualRows, accounts);
  const b = pnl(budgetRows, accounts);
  return {
    revenue: triple('REVENUE', b.revenue, a.revenue),
    otherOperatingCosts: triple('COGS', b.otherOperatingCosts, a.otherOperatingCosts),
    opex: triple('OPEX', b.opex, a.opex),
    operatingProfit: triple('REVENUE', b.operatingProfit, a.operatingProfit),
  };
}

/** VAR-OPX-001 - Variance by account, largest absolute variance first (ties by account id). */
export function accountVariances(
  actualRows: GlRowInput[],
  budgetRows: GlRowInput[],
  accounts: AccountInput[],
): AccountVariance[] {
  const types = typeMap(accounts);
  const names = nameMap(accounts);
  const sums = new Map<string, { a: number; b: number }>();
  const add = (rows: GlRowInput[], k: 'a' | 'b'): void => {
    for (const r of rows) {
      if (!types.has(r.account_id)) throw new Error(`unknown account ${r.account_id}`);
      const s = sums.get(r.account_id) ?? { a: 0, b: 0 };
      s[k] += r.amount_inr;
      sums.set(r.account_id, s);
    }
  };
  add(actualRows, 'a');
  add(budgetRows, 'b');
  return [...sums.entries()]
    .map(([id, s]) => ({
      account_id: id,
      type: types.get(id) as AccountType,
      ...(names.get(id) !== undefined ? { name: names.get(id) as string } : {}),
      ...triple(types.get(id) as AccountType, s.b, s.a),
    }))
    .sort(
      (x, y) =>
        Math.abs(y.variance) - Math.abs(x.variance) || (x.account_id < y.account_id ? -1 : 1),
    );
}
