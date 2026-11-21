import { roundDiv } from './allocate';
import { assertRupees } from './money';
import type { Rupees } from './money';

/** Revenue and cost lines for a span of months. Costs are positive amounts. */
export interface PnlLines {
  revenue: Rupees;
  materials: Rupees;
  labour: Rupees;
  overheads: Rupees;
  freight: Rupees;
  opex: Rupees;
}
export interface ScenarioBase {
  /** Actuals to date for the financial year. */
  ytd: PnlLines;
  /** Latest forecast for the months still to come. */
  remaining: PnlLines;
}
/** Shocks in basis points (100 bps = 1%). Applied to the remaining months only. */
export interface ScenarioShocks {
  volume_bps: number;
  price_bps: number;
  material_cost_bps: number;
  opex_bps: number;
}
export interface PnlResult extends PnlLines {
  cost_of_sales: Rupees;
  operating_profit: Rupees;
}
export interface ScenarioResult {
  shocks: ScenarioShocks;
  remaining_before: PnlResult;
  remaining_after: PnlResult;
  full_year_before: PnlResult;
  full_year_after: PnlResult;
  /** after - before, full year. */
  delta: PnlResult;
  /** Operating profit is used as the EBITDA proxy: the dataset has no depreciation or amortisation. */
  assumptions: string[];
}

export const MAX_SHOCK_BPS = 5000;
export const SCENARIO_ASSUMPTIONS: readonly string[] = [
  'Volume changes revenue, direct materials and freight in proportion; direct labour, manufacturing overheads and operating expenses are fixed.',
  'Price changes revenue only (applied after volume). Material cost inflation applies to the volume-adjusted materials cost.',
  'Shocks apply to the months still to come in the latest forecast; actuals to date are unchanged.',
  'Operating profit is the EBITDA proxy (no depreciation or amortisation in the data). Cash flow is not modelled.',
];

const apply = (amount: number, bps: number): number =>
  roundDiv(BigInt(amount) * BigInt(10_000 + bps), 10_000n);
const finish = (l: PnlLines): PnlResult => {
  const cos = l.materials + l.labour + l.overheads + l.freight;
  return { ...l, cost_of_sales: cos, operating_profit: l.revenue - cos - l.opex };
};
const add = (a: PnlLines, b: PnlLines): PnlLines => ({
  revenue: a.revenue + b.revenue,
  materials: a.materials + b.materials,
  labour: a.labour + b.labour,
  overheads: a.overheads + b.overheads,
  freight: a.freight + b.freight,
  opex: a.opex + b.opex,
});

/**
 * SCN-WHI-001 - What-if on the latest forecast. Deterministic, integer arithmetic; see
 * docs/methodology.md#what-if-scenario for the assumptions that apply.
 */
export function runScenario(base: ScenarioBase, shocks: ScenarioShocks): ScenarioResult {
  for (const [k, v] of Object.entries(shocks)) {
    if (!Number.isInteger(v) || Math.abs(v) > MAX_SHOCK_BPS)
      throw new RangeError(
        `${k} must be an integer between -${MAX_SHOCK_BPS} and ${MAX_SHOCK_BPS} basis points`,
      );
  }
  for (const part of [base.ytd, base.remaining])
    for (const [k, v] of Object.entries(part)) assertRupees(v, k);

  const r = base.remaining;
  const volumeAdjusted = {
    revenue: apply(r.revenue, shocks.volume_bps),
    materials: apply(r.materials, shocks.volume_bps),
    freight: apply(r.freight, shocks.volume_bps),
  };
  const after: PnlLines = {
    revenue: apply(volumeAdjusted.revenue, shocks.price_bps),
    materials: apply(volumeAdjusted.materials, shocks.material_cost_bps),
    labour: r.labour,
    overheads: r.overheads,
    freight: volumeAdjusted.freight,
    opex: apply(r.opex, shocks.opex_bps),
  };
  const fyBefore = finish(add(base.ytd, r));
  const fyAfter = finish(add(base.ytd, after));
  const diff = (k: keyof PnlResult): number => fyAfter[k] - fyBefore[k];
  return {
    shocks,
    remaining_before: finish(r),
    remaining_after: finish(after),
    full_year_before: fyBefore,
    full_year_after: fyAfter,
    delta: {
      revenue: diff('revenue'),
      materials: diff('materials'),
      labour: diff('labour'),
      overheads: diff('overheads'),
      freight: diff('freight'),
      opex: diff('opex'),
      cost_of_sales: diff('cost_of_sales'),
      operating_profit: diff('operating_profit'),
    },
    assumptions: [...SCENARIO_ASSUMPTIONS],
  };
}
