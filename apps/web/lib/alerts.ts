import type { ForecastComparison, VarianceReport } from '@fpa/engine';
import { fmtBps, fmtCr } from './format';

export interface Alert {
  level: 'critical' | 'warning' | 'info';
  text: string;
  href: string;
}

/** Thresholds are display rules, not Finance policy (see assumption A28). */
export const ALERT_RULES = { revenueBps: -500, opexBps: 500, forecastBps: -200 } as const;

export interface AlertInput {
  report: VarianceReport;
  forecast: ForecastComparison;
  statusCounts: Record<string, number>;
  auditOk: boolean;
}

/** Deterministic alerts from engine numbers. Critical first, then warning, then info. */
export function buildAlerts(i: AlertInput): Alert[] {
  const out: Alert[] = [];
  const { pnl } = i.report;
  if (!i.auditOk)
    out.push({
      level: 'critical',
      text: 'The approval audit log failed its integrity check. Do not rely on approval history until this is resolved.',
      href: '/actions',
    });
  if (!i.forecast.bridge.reconciles)
    out.push({
      level: 'critical',
      text: `The forecast drivers do not add up to the forecast change in: ${i.forecast.bridge.unreconciled_periods.join(', ')}.`,
      href: '/forecast',
    });
  if (pnl.operatingProfit.variance < 0)
    out.push({
      level: 'warning',
      text: `Operating profit is ${fmtCr(pnl.operatingProfit.variance, { abs: true })} below budget.`,
      href: '/variance',
    });
  if (pnl.revenue.variance_bps !== null && pnl.revenue.variance_bps <= ALERT_RULES.revenueBps)
    out.push({
      level: 'warning',
      text: `Revenue is ${fmtBps(pnl.revenue.variance_bps, { abs: true })} below budget.`,
      href: '/variance',
    });
  if (pnl.opex.variance_bps !== null && pnl.opex.variance_bps >= ALERT_RULES.opexBps)
    out.push({
      level: 'warning',
      text: `Operating expenses are ${fmtBps(pnl.opex.variance_bps, { abs: true })} above budget.`,
      href: '/variance#trend',
    });
  const fc = i.forecast.change_vs_previous_bps;
  if (fc !== null && fc <= ALERT_RULES.forecastBps)
    out.push({
      level: 'warning',
      text: `The full-year revenue forecast was cut by ${fmtCr(i.forecast.change_vs_previous, { abs: true })} (${fmtBps(fc, { abs: true })}).`,
      href: '/forecast',
    });
  const proposed = i.statusCounts.PROPOSED ?? 0;
  const validated = i.statusCounts.BUSINESS_VALIDATED ?? 0;
  if (proposed > 0)
    out.push({
      level: 'info',
      text: `${proposed} recommendation${proposed === 1 ? '' : 's'} awaiting validation.`,
      href: '/actions',
    });
  if (validated > 0)
    out.push({
      level: 'info',
      text: `${validated} recommendation${validated === 1 ? '' : 's'} awaiting authorisation.`,
      href: '/actions',
    });
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
