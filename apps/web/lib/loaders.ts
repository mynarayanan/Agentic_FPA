import {
  controlsData,
  forecastData,
  getRecommendation,
  listRecommendations,
  overrunTrend,
  scenarioFor,
  varianceReport,
  verifyAudit,
  view,
} from '@fpa/db';
import type {
  AuditReport,
  Controls,
  Db,
  EventRow,
  ForecastData,
  RecommendationView,
  ScenarioOutput,
  TrendPoint,
} from '@fpa/db';
import type { VarianceReport } from '@fpa/engine';
import { generateNarrative } from '@fpa/narrative';
import type { NarrativeResult } from '@fpa/narrative';
import { DEFAULT_CONFIG } from '@fpa/audit';
import { buildAlerts } from './alerts';
import type { Alert } from './alerts';
import { SCENARIO_DEFAULT_BPS } from './scenario-defaults';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Use the requested period only if it is a closed period with data; otherwise the latest one. */
export function pickPeriod(controls: Controls, requested?: string | null): string {
  return requested && PERIOD.test(requested) && controls.periods.includes(requested)
    ? requested
    : (controls.periods.at(-1) as string);
}
export function pickEntity(controls: Controls, requested?: string | null): string | undefined {
  return requested && controls.entities.some((e) => e.entity_id === requested)
    ? requested
    : undefined;
}

async function mustReport(db: Db, period: string, entity?: string): Promise<VarianceReport> {
  const r = await varianceReport(db, { period, entity });
  if (!r) throw new Error(`no actual and budget data for ${period}`);
  return r;
}

export interface CockpitData {
  period: string;
  report: VarianceReport;
  forecast: ForecastData;
  recommendations: RecommendationView[];
  statusCounts: Record<string, number>;
  audit: AuditReport;
  alerts: Alert[];
  narrative: NarrativeResult;
}
export async function loadCockpit(db: Db): Promise<CockpitData> {
  const controls = await controlsData(db);
  const period = pickPeriod(controls);
  const [report, forecast, recs, audit] = await Promise.all([
    mustReport(db, period),
    forecastData(db),
    listRecommendations(db, { period }),
    verifyAudit(db),
  ]);
  const recommendations = recs.map((r) => view(r, DEFAULT_CONFIG));
  const statusCounts: Record<string, number> = {};
  for (const r of recommendations) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  return {
    period,
    report,
    forecast,
    recommendations,
    statusCounts,
    audit,
    alerts: buildAlerts({ report, forecast: forecast.comparison, statusCounts, auditOk: audit.ok }),
    narrative: await generateNarrative(null, report),
  };
}

export interface VarianceData {
  period: string;
  entity: string | undefined;
  controls: Controls;
  report: VarianceReport;
  trend: Array<{ account_id: string; name: string; points: TrendPoint[] }>;
  narrative: NarrativeResult;
}
export async function loadVariance(
  db: Db,
  q: { period?: string | null; entity?: string | null },
): Promise<VarianceData> {
  const controls = await controlsData(db);
  const period = pickPeriod(controls, q.period);
  const entity = pickEntity(controls, q.entity);
  const [report, trend] = await Promise.all([mustReport(db, period, entity), overrunTrend(db)]);
  return {
    period,
    entity,
    controls,
    report,
    trend,
    narrative: await generateNarrative(null, report),
  };
}

export interface ForecastScreenData {
  forecast: ForecastData;
  scenario: ScenarioOutput;
}
export async function loadForecast(db: Db): Promise<ForecastScreenData> {
  const [forecast, scenario] = await Promise.all([
    forecastData(db),
    scenarioFor(db, SCENARIO_DEFAULT_BPS),
  ]);
  return { forecast, scenario };
}

export interface PortfolioTotals {
  count: number;
  headline_inr: number;
  revenue_recovery_inr: number;
  overlap_haircut_inr: number;
  net_in_year_profit_inr: number;
}

/** Plain sums of the engine's stored per-action assessments. */
export function portfolioTotals(recs: RecommendationView[]): PortfolioTotals {
  const a = (r: RecommendationView) =>
    r.assessment as {
      gross_inr: number;
      revenue_impact_inr: number;
      overlap_haircut_inr: number;
      net_in_year_profit_inr: number;
    };
  const sum = (f: (x: ReturnType<typeof a>) => number) => recs.reduce((s, r) => s + f(a(r)), 0);
  return {
    count: recs.length,
    headline_inr: sum((x) => x.gross_inr),
    revenue_recovery_inr: sum((x) => x.revenue_impact_inr),
    overlap_haircut_inr: sum((x) => x.overlap_haircut_inr),
    net_in_year_profit_inr: sum((x) => x.net_in_year_profit_inr),
  };
}

export interface ActionsData {
  period: string;
  gap_inr: number;
  totals: PortfolioTotals;
  recommendations: Array<{ rec: RecommendationView; events: EventRow[]; chainOk: boolean }>;
  audit: AuditReport;
}
export async function loadActions(db: Db, requested?: string | null): Promise<ActionsData> {
  const controls = await controlsData(db);
  const period = pickPeriod(controls, requested);
  const [report, recs, audit] = await Promise.all([
    mustReport(db, period),
    listRecommendations(db, { period }),
    verifyAudit(db),
  ]);
  const details = await Promise.all(recs.map((r) => getRecommendation(db, r.id)));
  const recommendations = recs.map((r, i) => ({
    rec: view(r, DEFAULT_CONFIG),
    events: details[i]?.events ?? [],
    chainOk: details[i]?.chain.ok ?? false,
  }));
  return {
    period,
    gap_inr: Math.max(0, -report.pnl.operatingProfit.variance),
    totals: portfolioTotals(recommendations.map((x) => x.rec)),
    recommendations,
    audit,
  };
}

export interface AssistantData {
  period: string;
  entity: string | undefined;
  controls: Controls;
}
export async function loadAssistant(
  db: Db,
  q: { period?: string | null; entity?: string | null },
): Promise<AssistantData> {
  const controls = await controlsData(db);
  return {
    period: pickPeriod(controls, q.period),
    entity: pickEntity(controls, q.entity),
    controls,
  };
}
