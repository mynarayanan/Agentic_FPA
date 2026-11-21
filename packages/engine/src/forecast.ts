import { roundDiv } from './allocate';
import { assertRupees } from './money';
import type { Rupees } from './money';

export interface MonthRevenue {
  period: string;
  revenue_inr: Rupees;
}
export interface BridgeRow {
  driver: string;
  sub_driver: string;
  period: string;
  amount_inr: Rupees;
}
export interface ForecastComparisonInput {
  /** Last closed actual month, e.g. 2026-11. */
  closedThrough: string;
  budget: MonthRevenue[];
  previous: MonthRevenue[];
  latest: MonthRevenue[];
  /** Prior-year actuals, aligned to the forecast months by position (month 1 with month 1). */
  priorYear: MonthRevenue[];
  bridge: BridgeRow[];
}

export interface ForecastMonth {
  period: string;
  budget: Rupees;
  previous: Rupees;
  latest: Rupees;
  prior_year: Rupees;
  change: Rupees;
}
export interface BridgeLine {
  driver: string;
  sub_driver: string;
  actual_to_date: Rupees;
  remaining: Rupees;
  total: Rupees;
}
export interface ForecastComparison {
  full_year: { budget: Rupees; previous: Rupees; latest: Rupees; prior_year: Rupees };
  change_vs_previous: Rupees;
  change_vs_previous_bps: number | null;
  change_vs_budget: Rupees;
  change_vs_budget_bps: number | null;
  growth_previous_bps: number | null;
  growth_latest_bps: number | null;
  actual_to_date_latest: Rupees;
  remaining_latest: Rupees;
  months: ForecastMonth[];
  bridge: {
    total: Rupees;
    by_driver: Record<string, Rupees>;
    lines: BridgeLine[];
    /** True when the drivers add up to the forecast change, month by month. */
    reconciles: boolean;
    unreconciled_periods: string[];
  };
}

const sum = (xs: MonthRevenue[]): number => xs.reduce((s, x) => s + x.revenue_inr, 0);
const ratioBps = (num: number, den: number): number | null =>
  den > 0 ? roundDiv(BigInt(num) * 10_000n, BigInt(den)) : null;

/**
 * FCS-CMP-001 - Compare forecast versions and attribute the change between them to drivers.
 * Reports whether the drivers reconcile to the forecast change for every month.
 */
export function compareForecasts(i: ForecastComparisonInput): ForecastComparison {
  const n = i.budget.length;
  if (n === 0 || i.previous.length !== n || i.latest.length !== n || i.priorYear.length !== n)
    throw new RangeError('all versions must cover the same number of months');
  for (let k = 0; k < n; k++) {
    const p = (i.budget[k] as MonthRevenue).period;
    if ((i.previous[k] as MonthRevenue).period !== p || (i.latest[k] as MonthRevenue).period !== p)
      throw new RangeError(`period mismatch at month ${k + 1}`);
    if (k > 0 && p <= (i.budget[k - 1] as MonthRevenue).period)
      throw new RangeError('months must be in ascending order');
  }
  for (const v of [
    ...i.budget,
    ...i.previous,
    ...i.latest,
    ...i.priorYear,
    ...i.bridge.map((b) => ({ revenue_inr: b.amount_inr })),
  ])
    assertRupees(v.revenue_inr);

  const months: ForecastMonth[] = i.budget.map((b, k) => ({
    period: b.period,
    budget: b.revenue_inr,
    previous: (i.previous[k] as MonthRevenue).revenue_inr,
    latest: (i.latest[k] as MonthRevenue).revenue_inr,
    prior_year: (i.priorYear[k] as MonthRevenue).revenue_inr,
    change: (i.latest[k] as MonthRevenue).revenue_inr - (i.previous[k] as MonthRevenue).revenue_inr,
  }));
  const fy = {
    budget: sum(i.budget),
    previous: sum(i.previous),
    latest: sum(i.latest),
    prior_year: sum(i.priorYear),
  };

  const lineMap = new Map<string, BridgeLine>();
  const byDriver: Record<string, number> = {};
  const byPeriod = new Map<string, number>();
  for (const b of i.bridge) {
    const key = `${b.driver}|${b.sub_driver}`;
    const line = lineMap.get(key) ?? {
      driver: b.driver,
      sub_driver: b.sub_driver,
      actual_to_date: 0,
      remaining: 0,
      total: 0,
    };
    if (b.period <= i.closedThrough) line.actual_to_date += b.amount_inr;
    else line.remaining += b.amount_inr;
    line.total += b.amount_inr;
    lineMap.set(key, line);
    byDriver[b.driver] = (byDriver[b.driver] ?? 0) + b.amount_inr;
    byPeriod.set(b.period, (byPeriod.get(b.period) ?? 0) + b.amount_inr);
  }
  const unreconciled = new Set<string>();
  const known = new Set(months.map((m) => m.period));
  for (const m of months)
    if ((byPeriod.get(m.period) ?? 0) !== m.change) unreconciled.add(m.period);
  for (const p of byPeriod.keys()) if (!known.has(p)) unreconciled.add(p);

  const change = fy.latest - fy.previous;
  return {
    full_year: fy,
    change_vs_previous: change,
    change_vs_previous_bps: ratioBps(change, fy.previous),
    change_vs_budget: fy.latest - fy.budget,
    change_vs_budget_bps: ratioBps(fy.latest - fy.budget, fy.budget),
    growth_previous_bps: ratioBps(fy.previous - fy.prior_year, fy.prior_year),
    growth_latest_bps: ratioBps(fy.latest - fy.prior_year, fy.prior_year),
    actual_to_date_latest: sum(i.latest.filter((m) => m.period <= i.closedThrough)),
    remaining_latest: sum(i.latest.filter((m) => m.period > i.closedThrough)),
    months,
    bridge: {
      total: [...byPeriod.values()].reduce((s, x) => s + x, 0),
      by_driver: Object.fromEntries(Object.entries(byDriver).sort(([a], [b]) => (a < b ? -1 : 1))),
      lines: [...lineMap.values()].sort((a, b) =>
        a.driver + a.sub_driver < b.driver + b.sub_driver ? -1 : 1,
      ),
      reconciles: unreconciled.size === 0,
      unreconciled_periods: [...unreconciled].sort(),
    },
  };
}
