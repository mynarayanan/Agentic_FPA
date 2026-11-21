import { sql } from 'drizzle-orm';
import { compareForecasts, calcRegistry, runScenario, varianceBps } from '@fpa/engine';
import type {
  ForecastComparison,
  MonthRevenue,
  PnlLines,
  ScenarioResult,
  ScenarioShocks,
} from '@fpa/engine';
import { rowsOf } from './client';
import type { Db } from './client';

export const FORECAST_VERSIONS = {
  budget: 'BUD_FY27',
  previous: 'FC_FY27_OCT',
  latest: 'FC_FY27_NOV',
  priorYear: 'ACT_FY26',
} as const;
const num = (v: unknown): number => Number(v ?? 0);

export interface ForecastData {
  closed_through: string;
  comparison: ForecastComparison;
  planner_overrides: Array<{
    period: string;
    entity_id: string;
    bu_id: string;
    delta_inr: number;
    role: string;
    reason: string;
  }>;
  demand_assumptions: Array<{
    bu_id: string;
    bu_name: string;
    budget_bps: number;
    previous_bps: number;
    latest_bps: number;
  }>;
  calc_refs: Array<{ id: string; version: string }>;
}

async function closedThrough(db: Db): Promise<string> {
  const [r] = rowsOf<{ p: string | null }>(
    await db.execute(
      sql`select as_of_period as p from dim_version where version_id = ${FORECAST_VERSIONS.latest}`,
    ),
  );
  if (!r?.p) throw new Error('latest forecast version has no as_of_period');
  return r.p;
}

async function monthlyRevenue(db: Db, version: string): Promise<MonthRevenue[]> {
  const rows = rowsOf<{ period: string; v: string }>(
    await db.execute(sql`select g.period, sum(g.amount_inr)::text as v from fact_gl g join dim_account a on a.account_id = g.account_id
      where a.type = 'REVENUE' and g.version_id = ${version} group by g.period order by g.period`),
  );
  return rows.map((r) => ({ period: r.period, revenue_inr: num(r.v) }));
}

/** Forecast versions, driver attribution, planner overrides and demand assumptions: the data behind the forecast screen. */
export async function forecastData(db: Db): Promise<ForecastData> {
  const closed = await closedThrough(db);
  const [budget, previous, latest, priorYear] = await Promise.all([
    monthlyRevenue(db, FORECAST_VERSIONS.budget),
    monthlyRevenue(db, FORECAST_VERSIONS.previous),
    monthlyRevenue(db, FORECAST_VERSIONS.latest),
    monthlyRevenue(db, FORECAST_VERSIONS.priorYear),
  ]);
  const bridge = rowsOf<{ driver: string; sub_driver: string; period: string; v: string }>(
    await db.execute(
      sql`select driver, sub_driver, period, sum(amount_inr)::text as v from fact_forecast_bridge group by 1, 2, 3 order by 3, 1, 2`,
    ),
  ).map((r) => ({
    driver: r.driver,
    sub_driver: r.sub_driver,
    period: r.period,
    amount_inr: num(r.v),
  }));
  const overrides = rowsOf<{
    period: string;
    entity_id: string;
    bu_id: string;
    delta_inr: string;
    role: string;
    reason: string;
  }>(
    await db.execute(
      sql`select period, entity_id, bu_id, delta_inr::text, role, reason from fact_planner_override order by period, entity_id, bu_id`,
    ),
  ).map((r) => ({ ...r, delta_inr: num(r.delta_inr) }));
  const demand = rowsOf<{ bu_id: string; bu_name: string; version_id: string; growth_bps: number }>(
    await db.execute(
      sql`select d.bu_id, b.name as bu_name, d.version_id, d.growth_bps from fact_demand_assumption d join dim_bu b on b.bu_id = d.bu_id order by d.bu_id`,
    ),
  );
  const byBu = new Map<string, ForecastData['demand_assumptions'][number]>();
  for (const r of demand) {
    const row = byBu.get(r.bu_id) ?? {
      bu_id: r.bu_id,
      bu_name: r.bu_name,
      budget_bps: 0,
      previous_bps: 0,
      latest_bps: 0,
    };
    if (r.version_id === FORECAST_VERSIONS.budget) row.budget_bps = num(r.growth_bps);
    if (r.version_id === FORECAST_VERSIONS.previous) row.previous_bps = num(r.growth_bps);
    if (r.version_id === FORECAST_VERSIONS.latest) row.latest_bps = num(r.growth_bps);
    byBu.set(r.bu_id, row);
  }
  return {
    closed_through: closed,
    comparison: compareForecasts({
      closedThrough: closed,
      budget,
      previous,
      latest,
      priorYear,
      bridge,
    }),
    planner_overrides: overrides,
    demand_assumptions: [...byBu.values()],
    calc_refs: calcRegistry
      .filter((c) => c.id === 'FCS-CMP-001')
      .map((c) => ({ id: c.id, version: c.version })),
  };
}

const LINE_OF: Record<string, keyof PnlLines> = {
  '5000': 'materials',
  '5100': 'labour',
  '5200': 'overheads',
  '5300': 'freight',
};

/** Latest forecast split into actuals to date and months still to come, by the lines the scenario model needs. */
export async function scenarioBase(
  db: Db,
): Promise<{ closed_through: string; ytd: PnlLines; remaining: PnlLines }> {
  const closed = await closedThrough(db);
  const rows = rowsOf<{ remaining: boolean; account_id: string; type: string; v: string }>(
    await db.execute(sql`select (g.period > ${closed}) as remaining, g.account_id, a.type, sum(g.amount_inr)::text as v
      from fact_gl g join dim_account a on a.account_id = g.account_id where g.version_id = ${FORECAST_VERSIONS.latest} group by 1, 2, 3`),
  );
  const empty = (): PnlLines => ({
    revenue: 0,
    materials: 0,
    labour: 0,
    overheads: 0,
    freight: 0,
    opex: 0,
  });
  const out = { ytd: empty(), remaining: empty() };
  for (const r of rows) {
    const target = r.remaining ? out.remaining : out.ytd;
    const line: keyof PnlLines =
      r.type === 'REVENUE'
        ? 'revenue'
        : r.type === 'OPEX'
          ? 'opex'
          : (LINE_OF[r.account_id] as keyof PnlLines);
    target[line] += num(r.v);
  }
  return { closed_through: closed, ...out };
}

export interface ScenarioOutput {
  closed_through: string;
  base: { ytd: PnlLines; remaining: PnlLines };
  result: ScenarioResult;
  calc_refs: Array<{ id: string; version: string }>;
}
export async function scenarioFor(db: Db, shocks: ScenarioShocks): Promise<ScenarioOutput> {
  const b = await scenarioBase(db);
  return {
    closed_through: b.closed_through,
    base: { ytd: b.ytd, remaining: b.remaining },
    result: runScenario(b, shocks),
    calc_refs: calcRegistry
      .filter((c) => c.id === 'SCN-WHI-001')
      .map((c) => ({ id: c.id, version: c.version })),
  };
}

export interface TrendPoint {
  period: string;
  actual_inr: number;
  budget_inr: number;
  variance_inr: number;
  variance_bps: number | null;
}
/** Monthly actual-versus-budget for the discretionary cost accounts, to show whether an overrun is recurring. */
export async function overrunTrend(
  db: Db,
): Promise<Array<{ account_id: string; name: string; points: TrendPoint[] }>> {
  const rows = rowsOf<{
    account_id: string;
    name: string;
    period: string;
    version_id: string;
    v: string;
  }>(
    await db.execute(sql`select g.account_id, a.name, g.period, g.version_id, sum(g.amount_inr)::text as v
      from fact_gl g join dim_account a on a.account_id = g.account_id
      where a.discretionary and g.version_id in ('ACT_FY27', 'BUD_FY27') and g.period <= (select as_of_period from dim_version where version_id = 'ACT_FY27')
      group by 1, 2, 3, 4 order by 1, 3`),
  );
  const acc = new Map<string, { name: string; by: Map<string, { a: number; b: number }> }>();
  for (const r of rows) {
    const e = acc.get(r.account_id) ?? { name: r.name, by: new Map() };
    const p = e.by.get(r.period) ?? { a: 0, b: 0 };
    if (r.version_id === 'ACT_FY27') p.a = num(r.v);
    else p.b = num(r.v);
    e.by.set(r.period, p);
    acc.set(r.account_id, e);
  }
  return [...acc.entries()].map(([account_id, e]) => ({
    account_id,
    name: e.name,
    points: [...e.by.entries()].map(([period, p]) => ({
      period,
      actual_inr: p.a,
      budget_inr: p.b,
      variance_inr: p.a - p.b,
      variance_bps: varianceBps(p.a - p.b, p.b),
    })),
  }));
}

export interface Controls {
  periods: string[];
  entities: Array<{ entity_id: string; name: string }>;
}
/** Selector options: closed actual periods that also have a budget, and the legal entities. */
export async function controlsData(db: Db): Promise<Controls> {
  const periods = rowsOf<{ period: string }>(
    await db.execute(
      sql`select distinct period from fact_gl where version_id = 'ACT_FY27' and period in (select period from fact_gl where version_id = 'BUD_FY27') order by period`,
    ),
  ).map((r) => r.period);
  const entities = rowsOf<{ entity_id: string; name: string }>(
    await db.execute(sql`select entity_id, name from dim_entity order by entity_id`),
  );
  return { periods, entities };
}
