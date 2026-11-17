import { TABLE_NAMES, TABLE_SCHEMAS } from '@fpa/semantic';
import type { TableName } from '@fpa/semantic';
import {
  ACCOUNTS,
  ACTIONS,
  BUS,
  ENTITIES,
  PRODUCTS,
  VERSIONS,
  buildCustomers,
  buildFxRates,
  buildPeriods,
} from './dims';
import type { Row } from './dims';
import { buildGl } from './gl';
import {
  DEMAND_ASSUMPTIONS,
  buildHeadcount,
  buildOpexTxns,
  buildOrders,
  buildSupplierSpend,
  buildSuppliers,
  sumGl,
} from './ops';
import { Rng, SEED } from './prng';
import { buildSales, referenceBridge, salesRows } from './sales';
import { cr } from './units';

export const GENERATOR_VERSION = '1.0.0';
export type Tables = Record<TableName, Row[]>;
export interface Dataset {
  tables: Tables;
  golden: Record<string, unknown>;
  questions: Array<Record<string, unknown>>;
}

export function generateDataset(seed = SEED): Dataset {
  const rng = new Rng(seed);
  const customers = buildCustomers(rng.fork('customers'));
  const lines = buildSales(rng.fork('sales'), customers as never);
  const { gl, bridge, overrides } = buildGl(rng.fork('gl'), lines);
  const suppliers = buildSuppliers(rng.fork('suppliers'));

  const raw: Tables = {
    dim_entity: [...ENTITIES],
    dim_bu: [...BUS],
    dim_product: [...PRODUCTS],
    dim_customer: customers,
    dim_account: [...ACCOUNTS],
    dim_period: buildPeriods(),
    dim_version: [...VERSIONS],
    dim_supplier: suppliers,
    dim_action: ACTIONS,
    fx_rate: buildFxRates(rng.fork('fx')),
    fact_gl: gl,
    fact_sales_line: salesRows(lines),
    fact_order_book: buildOrders(rng.fork('orders'), customers as never),
    fact_opex_txn: buildOpexTxns(rng.fork('opex'), gl),
    fact_headcount: buildHeadcount(rng.fork('hc'), gl),
    fact_supplier_spend: buildSupplierSpend(rng.fork('spend'), gl, suppliers),
    fact_demand_assumption: DEMAND_ASSUMPTIONS,
    fact_forecast_bridge: bridge,
    fact_planner_override: overrides,
  };
  // Validate every row against the shared Zod contracts; strict() rejects unexpected columns.
  const tables = {} as Tables;
  for (const t of TABLE_NAMES)
    tables[t] = raw[t].map((r) => TABLE_SCHEMAS[t].strict().parse(r) as Row);

  const golden = buildGolden(tables, lines, seed);
  return { tables, golden, questions: buildQuestions(golden) };
}

type Golden = ReturnType<typeof buildGolden>;
function buildGolden(t: Tables, lines: ReturnType<typeof buildSales>, seed: number) {
  const gl = t.fact_gl;
  const v = (version: string, period: string | null, f: (a: string) => boolean): number =>
    sumGl(
      gl,
      (r) =>
        r.version_id === version &&
        (period === null || r.period === period) &&
        f(r.account_id as string),
    );
  const rev = (a: string): boolean => a < '5';
  const cogs = (a: string): boolean => a >= '5' && a < '6';
  const opex = (a: string): boolean => a >= '6';
  const trio = (b: number, a: number) => ({ budget: b, actual: a, variance: a - b });
  const nov = (f: (a: string) => boolean) =>
    trio(v('BUD_FY27', '2026-11', f), v('ACT_FY27', '2026-11', f));
  const ref = referenceBridge(lines);
  const opexByAccount: Record<string, ReturnType<typeof trio>> = {};
  for (const a of ['6100', '6200', '6300', '6400', '6500', '6600', '6700', '6800'])
    opexByAccount[a] = nov((x) => x === a);
  const sumBridge = (f: (r: Row) => boolean): number =>
    t.fact_forecast_bridge.filter(f).reduce((a, r) => a + (r.amount_inr as number), 0);
  const fy = (version: string): number => v(version, null, rev);
  const revenueNov = nov(rev);
  const opexNov = nov(opex);
  const cogsNov = nov(cogs);
  const opProfit = trio(
    revenueNov.budget - cogsNov.budget - opexNov.budget,
    revenueNov.actual - cogsNov.actual - opexNov.actual,
  );
  return {
    meta: {
      generator_version: GENERATOR_VERSION,
      seed,
      currency: 'INR',
      unit: 'rupees (integers)',
      fiscal_year: 'FY27 = Apr 2026 - Mar 2027',
      as_of: '2026-11',
    },
    nov2026: {
      revenue: revenueNov,
      other_operating_costs: cogsNov,
      opex: opexNov,
      opex_overrun_pct: Number(((opexNov.variance / opexNov.budget) * 100).toFixed(2)),
      operating_profit: opProfit,
      opex_by_account: opexByAccount,
    },
    revenue_bridge_nov2026: {
      timing: ref.timing,
      price: ref.price,
      volume: ref.volume,
      mix: ref.mix,
      total: ref.total,
      planted_targets_inr: { volume: -cr(4), price: -cr(2), mix: -cr(1), timing: -cr(1) },
      industrial_equipment_unit_decline_pct: ref.ieUnitDeclinePct,
    },
    full_year_fy27: {
      budget: fy('BUD_FY27'),
      forecast_oct: fy('FC_FY27_OCT'),
      forecast_nov: fy('FC_FY27_NOV'),
      prior_year: fy('ACT_FY26'),
      forecast_change: fy('FC_FY27_NOV') - fy('FC_FY27_OCT'),
      forecast_change_pct: Number(
        (((fy('FC_FY27_NOV') - fy('FC_FY27_OCT')) / fy('FC_FY27_OCT')) * 100).toFixed(2),
      ),
      growth_vs_prior_year_pct: {
        forecast_oct: Number(((fy('FC_FY27_OCT') / fy('ACT_FY26') - 1) * 100).toFixed(1)),
        forecast_nov: Number(((fy('FC_FY27_NOV') / fy('ACT_FY26') - 1) * 100).toFixed(1)),
      },
    },
    forecast_bridge: {
      DEMAND: sumBridge((r) => r.driver === 'DEMAND'),
      FX: sumBridge((r) => r.driver === 'FX'),
      ORDER_DELAY: sumBridge((r) => r.driver === 'ORDER_DELAY'),
      total: sumBridge(() => true),
      nov_actual_to_date: sumBridge((r) => r.period === '2026-11'),
      dec_to_mar: sumBridge((r) => r.period !== '2026-11'),
    },
    actions: t.dim_action.map((a) => ({ action_id: a.action_id, potential_inr: a.potential_inr })),
  };
}

function buildQuestions(g: Golden): Array<Record<string, unknown>> {
  return [
    {
      id: 'Q01',
      question: 'What is the November 2026 revenue variance versus budget?',
      expected: { value_inr: g.nov2026.revenue.variance },
      calc_ref: 'VAR-REV-001',
    },
    {
      id: 'Q02',
      question: 'What is the November 2026 operating profit variance?',
      expected: { value_inr: g.nov2026.operating_profit.variance },
    },
    {
      id: 'Q03',
      question: 'By what percentage did operating expenses exceed budget in November 2026?',
      expected: { value_pct: g.nov2026.opex_overrun_pct },
    },
    {
      id: 'Q04',
      question: 'What was the price discounting impact on November 2026 revenue?',
      expected: { value_inr: g.revenue_bridge_nov2026.price },
    },
    {
      id: 'Q05',
      question: 'What was the timing impact (delayed orders) on November 2026 revenue?',
      expected: { value_inr: g.revenue_bridge_nov2026.timing },
    },
    {
      id: 'Q06',
      question: 'What are the volume and mix effects in the November 2026 revenue bridge?',
      expected: {
        volume_inr: g.revenue_bridge_nov2026.volume,
        mix_inr: g.revenue_bridge_nov2026.mix,
      },
    },
    {
      id: 'Q07',
      question:
        'By how much was the full-year FY27 revenue forecast reduced after the November close?',
      expected: { value_inr: g.full_year_fy27.forecast_change },
    },
    {
      id: 'Q08',
      question: 'What are the forecast change drivers (demand, FX, order delay)?',
      expected: {
        demand_inr: g.forecast_bridge.DEMAND,
        fx_inr: g.forecast_bridge.FX,
        order_delay_inr: g.forecast_bridge.ORDER_DELAY,
      },
    },
    {
      id: 'Q09',
      question: 'Which operating expense accounts have the largest overrun in November 2026?',
      expected: { top3_accounts: ['6300', '6400', '6200'] },
    },
    {
      id: 'Q10',
      question: 'What is the total proposed benefit of the four corrective actions?',
      expected: { value_inr: cr(10) + cr(1.5) + cr(2) + cr(0.8) },
      note: 'Gross, before overlap and timing-vs-incremental adjustments',
    },
    {
      id: 'Q11',
      question: 'Is the order-recovery opportunity incremental revenue or a timing shift?',
      expected: { classification: 'TIMING_RECOVERY' },
    },
    {
      id: 'Q12',
      question: 'Is the revenue shortfall growing or recurring across months?',
      expected: {
        note: 'Opex overrun on travel, consulting and contractors widens every month from May to November',
      },
    },
  ];
}
export { SEED };
