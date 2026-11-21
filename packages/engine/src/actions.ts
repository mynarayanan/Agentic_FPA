import { roundDiv } from './allocate';
import { assertRupees } from './money';
import type { Rupees } from './money';

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type ActionKind =
  'TIMING_RECOVERY' | 'RECURRING_SAVING' | 'RECURRING_MARGIN' | 'ONE_OFF_SAVING';

export interface ActionInput {
  action_id: string;
  title: string;
  kind: ActionKind;
  /** TIMING_RECOVERY: revenue recoverable. Others: profit benefit, both over the remaining forecast horizon at full realisation. */
  potential_inr: Rupees;
  timeline_days: number;
  implementation_cost_inr: Rupees;
  overlaps_with: string | null;
  confidence: Confidence;
}

export interface AssessmentParams {
  /** Period in which the decision is taken (benefits start after this). */
  decisionPeriod: string;
  /** Last month of the financial year being forecast. */
  fyEndPeriod: string;
  confidenceBps: Record<Confidence, number>;
  /** Share of an action's profit given up when it overlaps another action in the portfolio. */
  overlapHaircutBps: number;
  /** Standard margin applied to recovered revenue to express it as profit. */
  timingMarginBps: number;
}

/** Defaults are ASSUMPTIONS awaiting Finance sign-off (see docs/methodology.md#action-impact-assessment). */
export const DEFAULT_ASSESSMENT_PARAMS: AssessmentParams = {
  decisionPeriod: '2026-11',
  fyEndPeriod: '2027-03',
  confidenceBps: { HIGH: 9000, MEDIUM: 7000, LOW: 4000 },
  overlapHaircutBps: 5000,
  timingMarginBps: 3600,
};

export interface ActionAssessment {
  action_id: string;
  title: string;
  kind: ActionKind;
  gross_inr: Rupees;
  /** Revenue effect; non-zero only for timing recoveries. */
  revenue_impact_inr: Rupees;
  profit_gross_inr: Rupees;
  overlaps_with: string | null;
  overlap_haircut_inr: Rupees;
  confidence: Confidence;
  confidence_bps: number;
  risk_adjusted_profit_inr: Rupees;
  benefit_start_period: string;
  phasing_bps: number;
  in_year_profit_inr: Rupees;
  implementation_cost_inr: Rupees;
  net_in_year_profit_inr: Rupees;
  /** False when the revenue is recovered timing (pulled from next year), not new demand. */
  incremental: boolean;
  recurring: boolean;
  notes: string[];
}

export interface PortfolioTotals {
  gross_inr: Rupees;
  revenue_impact_inr: Rupees;
  profit_gross_inr: Rupees;
  overlap_haircut_inr: Rupees;
  risk_adjusted_profit_inr: Rupees;
  in_year_profit_inr: Rupees;
  implementation_cost_inr: Rupees;
  net_in_year_profit_inr: Rupees;
}

export interface PortfolioAssessment {
  actions: ActionAssessment[];
  totals: PortfolioTotals;
  /** Operating-profit shortfall the actions are meant to close (positive number), 0 if there is none. */
  gap_inr: Rupees;
  /** Net in-year profit as basis points of the gap; null when there is no gap. */
  gap_coverage_bps: number | null;
  params: AssessmentParams;
}

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
export function periodIndex(p: string): number {
  const m = PERIOD.exec(p);
  if (!m) throw new RangeError(`bad period ${p}`);
  return Number(m[1]) * 12 + Number(m[2]) - 1;
}
export function periodFromIndex(i: number): string {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}
const bps = (amount: number, factor: number): number =>
  roundDiv(BigInt(amount) * BigInt(factor), 10_000n);

/**
 * ACT-IMP-001 - Net a portfolio of corrective actions: express recoveries as profit, give way on overlaps,
 * weight by confidence, phase by when benefits can start, and deduct implementation cost.
 * See docs/methodology.md#action-impact-assessment.
 */
export function assessActions(
  actions: ActionInput[],
  operatingProfitVariance: Rupees,
  params: AssessmentParams = DEFAULT_ASSESSMENT_PARAMS,
): PortfolioAssessment {
  assertRupees(operatingProfitVariance, 'operatingProfitVariance');
  const decision = periodIndex(params.decisionPeriod);
  const fyEnd = periodIndex(params.fyEndPeriod);
  const horizon = Math.max(0, fyEnd - decision);
  const ids = new Set(actions.map((a) => a.action_id));
  if (ids.size !== actions.length) throw new Error('duplicate action ids');

  const out: ActionAssessment[] = actions.map((a) => {
    assertRupees(a.potential_inr, `${a.action_id} potential`);
    assertRupees(a.implementation_cost_inr, `${a.action_id} cost`);
    if (a.potential_inr < 0 || a.implementation_cost_inr < 0)
      throw new RangeError(`${a.action_id}: amounts must be non-negative`);
    if (!Number.isInteger(a.timeline_days) || a.timeline_days < 0)
      throw new RangeError(`${a.action_id}: timeline_days must be a non-negative integer`);
    const conf = params.confidenceBps[a.confidence];
    if (conf === undefined)
      throw new RangeError(`${a.action_id}: unknown confidence ${a.confidence}`);

    const notes: string[] = [];
    const timing = a.kind === 'TIMING_RECOVERY';
    const revenue = timing ? a.potential_inr : 0;
    const profitGross = timing ? bps(a.potential_inr, params.timingMarginBps) : a.potential_inr;
    if (timing)
      notes.push(
        'Revenue is recovered timing, not new demand; shown as profit at the standard margin.',
      );

    const knownOverlap =
      a.overlaps_with !== null && a.overlaps_with !== a.action_id && ids.has(a.overlaps_with);
    const haircut = knownOverlap ? bps(profitGross, params.overlapHaircutBps) : 0;
    if (knownOverlap)
      notes.push(
        `Overlaps ${a.overlaps_with}: ${params.overlapHaircutBps / 100}% of its profit is given up to avoid double counting.`,
      );
    else if (a.overlaps_with !== null)
      notes.push(
        `Declared overlap ${a.overlaps_with} is not in this portfolio; no haircut applied.`,
      );

    const riskAdjusted = bps(profitGross - haircut, conf);
    const start = decision + Math.ceil(a.timeline_days / 30);
    const benefitMonths = Math.max(0, fyEnd - start + 1);
    const phasing =
      horizon === 0
        ? 0
        : Math.min(10_000, roundDiv(BigInt(benefitMonths) * 10_000n, BigInt(horizon)));
    notes.push(
      `Benefits start ${periodFromIndex(start)}: ${phasing / 100}% of the remaining forecast horizon.`,
    );
    const inYear = bps(riskAdjusted, phasing);
    const recurring = a.kind === 'RECURRING_SAVING' || a.kind === 'RECURRING_MARGIN';
    notes.push(
      recurring
        ? 'Recurring: continues into the next financial year (not quantified here).'
        : a.kind === 'ONE_OFF_SAVING'
          ? 'One-off: no benefit beyond this financial year.'
          : 'One-time recovery: no recurring benefit.',
    );

    return {
      action_id: a.action_id,
      title: a.title,
      kind: a.kind,
      gross_inr: a.potential_inr,
      revenue_impact_inr: revenue,
      profit_gross_inr: profitGross,
      overlaps_with: a.overlaps_with,
      overlap_haircut_inr: haircut,
      confidence: a.confidence,
      confidence_bps: conf,
      risk_adjusted_profit_inr: riskAdjusted,
      benefit_start_period: periodFromIndex(start),
      phasing_bps: phasing,
      in_year_profit_inr: inYear,
      implementation_cost_inr: a.implementation_cost_inr,
      net_in_year_profit_inr: inYear - a.implementation_cost_inr,
      incremental: !timing,
      recurring,
      notes,
    };
  });

  out.sort(
    (x, y) =>
      y.net_in_year_profit_inr - x.net_in_year_profit_inr || (x.action_id < y.action_id ? -1 : 1),
  );
  const sum = (f: (a: ActionAssessment) => number): number => out.reduce((s, a) => s + f(a), 0);
  const totals: PortfolioTotals = {
    gross_inr: sum((a) => a.gross_inr),
    revenue_impact_inr: sum((a) => a.revenue_impact_inr),
    profit_gross_inr: sum((a) => a.profit_gross_inr),
    overlap_haircut_inr: sum((a) => a.overlap_haircut_inr),
    risk_adjusted_profit_inr: sum((a) => a.risk_adjusted_profit_inr),
    in_year_profit_inr: sum((a) => a.in_year_profit_inr),
    implementation_cost_inr: sum((a) => a.implementation_cost_inr),
    net_in_year_profit_inr: sum((a) => a.net_in_year_profit_inr),
  };
  const gap = operatingProfitVariance < 0 ? -operatingProfitVariance : 0;
  return {
    actions: out,
    totals,
    gap_inr: gap,
    gap_coverage_bps:
      gap === 0 ? null : roundDiv(BigInt(totals.net_in_year_profit_inr) * 10_000n, BigInt(gap)),
    params,
  };
}
