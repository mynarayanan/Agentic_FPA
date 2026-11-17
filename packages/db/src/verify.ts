import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { TableName } from '@fpa/semantic';
import { rowsOf } from './client';
import type { Db } from './client';
import { LOAD_ORDER } from './schema';

export interface Expected {
  manifest: { tables: Record<string, { rows: number }> };
  golden: {
    nov2026: { revenue: Pair; other_operating_costs: Pair; opex: Pair };
    full_year_fy27: {
      budget: number;
      forecast_oct: number;
      forecast_nov: number;
      prior_year: number;
    };
    forecast_bridge: { DEMAND: number; FX: number; ORDER_DELAY: number; total: number };
  };
}
interface Pair {
  budget: number;
  actual: number;
}
export interface Check {
  name: string;
  expected: number;
  actual: number;
  ok: boolean;
}

async function scalar(db: Db, q: SQL): Promise<number> {
  const [row] = rowsOf<{ v: string | number | null }>(await db.execute(q));
  return Number(row?.v ?? 0);
}

const glSum = (db: Db, version: string, period: string | null, type: string): Promise<number> =>
  scalar(
    db,
    sql`select coalesce(sum(g.amount_inr), 0)::text as v from fact_gl g join dim_account a on a.account_id = g.account_id
        where g.version_id = ${version} and (${period}::text is null or g.period = ${period}) and a.type = ${type}`,
  );

/** Post-load reconciliation: the database must hold exactly what the generator promised. */
export async function verifyLoad(db: Db, exp: Expected): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, expected: number, actual: number): void => {
    checks.push({ name, expected, actual, ok: expected === actual });
  };

  for (const t of LOAD_ORDER as TableName[]) {
    add(
      `rows: ${t}`,
      exp.manifest.tables[t]?.rows ?? -1,
      await scalar(db, sql`select count(*)::text as v from ${sql.raw(t)}`),
    );
  }
  const g = exp.golden;
  add(
    'Nov-26 revenue budget',
    g.nov2026.revenue.budget,
    await glSum(db, 'BUD_FY27', '2026-11', 'REVENUE'),
  );
  add(
    'Nov-26 revenue actual',
    g.nov2026.revenue.actual,
    await glSum(db, 'ACT_FY27', '2026-11', 'REVENUE'),
  );
  add(
    'Nov-26 other operating costs budget',
    g.nov2026.other_operating_costs.budget,
    await glSum(db, 'BUD_FY27', '2026-11', 'COGS'),
  );
  add(
    'Nov-26 other operating costs actual',
    g.nov2026.other_operating_costs.actual,
    await glSum(db, 'ACT_FY27', '2026-11', 'COGS'),
  );
  add('Nov-26 opex budget', g.nov2026.opex.budget, await glSum(db, 'BUD_FY27', '2026-11', 'OPEX'));
  add('Nov-26 opex actual', g.nov2026.opex.actual, await glSum(db, 'ACT_FY27', '2026-11', 'OPEX'));
  add('FY27 revenue budget', g.full_year_fy27.budget, await glSum(db, 'BUD_FY27', null, 'REVENUE'));
  add(
    'FY27 revenue forecast (Oct)',
    g.full_year_fy27.forecast_oct,
    await glSum(db, 'FC_FY27_OCT', null, 'REVENUE'),
  );
  add(
    'FY27 revenue forecast (Nov)',
    g.full_year_fy27.forecast_nov,
    await glSum(db, 'FC_FY27_NOV', null, 'REVENUE'),
  );
  add(
    'FY26 revenue actual',
    g.full_year_fy27.prior_year,
    await glSum(db, 'ACT_FY26', null, 'REVENUE'),
  );
  for (const d of ['DEMAND', 'FX', 'ORDER_DELAY'] as const) {
    add(
      `forecast bridge: ${d}`,
      g.forecast_bridge[d],
      await scalar(
        db,
        sql`select coalesce(sum(amount_inr), 0)::text as v from fact_forecast_bridge where driver = ${d}`,
      ),
    );
  }

  const zero = (name: string, q: SQL): Promise<void> => scalar(db, q).then((n) => add(name, 0, n));
  await zero(
    'every forecast-bridge cell equals the GL difference between forecast versions (mismatches)',
    sql`with d as (
          select g.period, g.entity_id, g.bu_id, sum(case when g.version_id = 'FC_FY27_NOV' then g.amount_inr else -g.amount_inr end) v
          from fact_gl g join dim_account a on a.account_id = g.account_id
          where a.type = 'REVENUE' and g.version_id in ('FC_FY27_NOV', 'FC_FY27_OCT') group by 1, 2, 3),
        b as (select period, entity_id, bu_id, sum(amount_inr) v from fact_forecast_bridge group by 1, 2, 3)
        select count(*)::text as v from d full join b on d.period = b.period and d.entity_id = b.entity_id and d.bu_id = b.bu_id
        where coalesce(d.v, 0) <> coalesce(b.v, 0)`,
  );
  await zero(
    'sales lines net amount equals GL revenue by entity, BU and version (mismatches)',
    sql`with s as (select version_id, entity_id, bu_id, sum(net_amount_inr) v from fact_sales_line group by 1, 2, 3),
        r as (select g.version_id, g.entity_id, g.bu_id, sum(g.amount_inr) v from fact_gl g join dim_account a on a.account_id = g.account_id
              where a.type = 'REVENUE' and g.period = '2026-11' and g.version_id in ('BUD_FY27', 'ACT_FY27') group by 1, 2, 3)
        select count(*)::text as v from s full join r on s.version_id = r.version_id and s.entity_id = r.entity_id and s.bu_id = r.bu_id
        where coalesce(s.v, 0) <> coalesce(r.v, 0)`,
  );
  await zero(
    'opex transactions equal GL actual by entity and account (mismatches)',
    sql`with t as (select entity_id, account_id, sum(amount_inr) v from fact_opex_txn group by 1, 2),
        r as (select entity_id, account_id, sum(amount_inr) v from fact_gl where version_id = 'ACT_FY27' and period = '2026-11'
              and account_id in (select distinct account_id from fact_opex_txn) group by 1, 2)
        select count(*)::text as v from t full join r on t.entity_id = r.entity_id and t.account_id = r.account_id
        where coalesce(t.v, 0) <> coalesce(r.v, 0)`,
  );
  await zero(
    'headcount cost equals GL salaries by version, period and entity (mismatches)',
    sql`with h as (select version_id, period, entity_id, sum(cost_inr) v from fact_headcount group by 1, 2, 3),
        r as (select version_id, period, entity_id, sum(amount_inr) v from fact_gl where account_id = '6100'
              and version_id in ('BUD_FY27', 'ACT_FY27') group by 1, 2, 3)
        select count(*)::text as v from h full join r on h.version_id = r.version_id and h.period = r.period and h.entity_id = r.entity_id
        where coalesce(h.v, 0) <> coalesce(r.v, 0)`,
  );
  await zero(
    'supplier spend equals GL direct materials actual by entity (mismatches)',
    sql`with s as (select entity_id, sum(amount_inr) v from fact_supplier_spend group by 1),
        r as (select entity_id, sum(amount_inr) v from fact_gl where account_id = '5000' and version_id = 'ACT_FY27' and period = '2026-11' group by 1)
        select count(*)::text as v from s full join r on s.entity_id = r.entity_id where coalesce(s.v, 0) <> coalesce(r.v, 0)`,
  );
  return checks;
}
