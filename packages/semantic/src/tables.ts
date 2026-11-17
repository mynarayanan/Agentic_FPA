import { z } from 'zod';

const inr = z.number().int();
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}`));

export const VERSION_IDS = [
  'BUD_FY27',
  'ACT_FY27',
  'FC_FY27_OCT',
  'FC_FY27_NOV',
  'ACT_FY26',
] as const;
export const versionId = z.enum(VERSION_IDS);
export type VersionId = z.infer<typeof versionId>;

export const dimEntity = z.object({
  entity_id: id('E-').describe('Legal entity key'),
  name: z.string(),
  country: z.string().length(2),
  functional_currency: z
    .enum(['INR', 'EUR', 'USD'])
    .describe('Local currency; reporting currency is INR'),
});
export const dimBu = z.object({ bu_id: id('BU-'), name: z.string() });
export const dimProduct = z.object({
  sku_id: z.string(),
  name: z.string(),
  bu_id: id('BU-'),
  budget_list_price_inr: inr.describe('Budget unit list price (INR). Always a multiple of 1,000'),
  std_margin_bps: z.number().int().describe('Standard gross margin in basis points'),
});
export const dimCustomer = z.object({
  customer_id: id('C-'),
  name: z.string(),
  entity_id: id('E-').describe('Selling entity'),
  region: z.enum(['India-North', 'India-South', 'India-West', 'Europe', 'North America']),
  segment: z.enum(['Strategic', 'Key', 'Standard']),
});
export const dimAccount = z.object({
  account_id: z.string().regex(/^\d{4}$/),
  name: z.string(),
  type: z.enum(['REVENUE', 'COGS', 'OPEX']),
  grp: z
    .string()
    .describe('Reporting group, e.g. Revenue, Other operating costs, Operating expenses'),
  discretionary: z.boolean().describe('True for travel, consulting, contractors'),
});
export const dimPeriod = z.object({
  period: period,
  fiscal_year: z.string().describe('FY27 = Apr 2026 - Mar 2027'),
  fiscal_month: z.number().int().min(1).max(12),
  is_closed_actual: z.boolean().describe('Actuals closed as of the November 2026 close'),
});
export const dimVersion = z.object({
  version_id: versionId,
  name: z.string(),
  kind: z.enum(['ACTUAL', 'BUDGET', 'FORECAST']),
  fiscal_year: z.string(),
  as_of_period: period.nullable(),
});
export const dimSupplier = z.object({
  supplier_id: id('S-'),
  name: z.string(),
  category: z.string(),
  contract_end_period: period,
  price_escalation_bps: z.number().int(),
  quality_score: z.number().int().min(0).max(100),
  alt_sources: z.number().int().min(0),
  renegotiation_candidate: z.boolean(),
});
export const fxRate = z.object({
  version_id: versionId,
  period,
  currency: z.enum(['EUR', 'USD']),
  rate_inr: z.number().positive().describe('INR per 1 unit of foreign currency'),
});
export const factGl = z.object({
  version_id: versionId,
  period,
  entity_id: id('E-'),
  bu_id: id('BU-'),
  account_id: z.string().regex(/^\d{4}$/),
  amount_inr: inr.describe('Positive for revenue and costs alike; account type gives the meaning'),
});
export const factSalesLine = z.object({
  line_key: z.string().describe('Stable key shared by the budget and actual view of the same line'),
  version_id: z.enum(['BUD_FY27', 'ACT_FY27']),
  period,
  entity_id: id('E-'),
  customer_id: id('C-'),
  sku_id: z.string(),
  bu_id: id('BU-'),
  quantity: z.number().int().min(0),
  list_price_inr: inr,
  gross_amount_inr: inr.describe('quantity x list price'),
  discount_inr: inr.describe('Invoice discount; the price effect'),
  net_amount_inr: inr.describe('gross - discount; ties to the GL revenue'),
  order_id: z.string().nullable(),
  delayed_to_period: period
    .nullable()
    .describe('Set on actual lines whose delivery slipped out of the period'),
});
export const factOrderBook = z.object({
  order_id: z.string(),
  customer_id: id('C-'),
  entity_id: id('E-'),
  sku_id: z.string(),
  quantity: z.number().int().positive(),
  value_inr: inr,
  original_delivery_period: period,
  current_delivery_period: period,
  status: z.enum(['CONFIRMED', 'PIPELINE']),
  delay_reason: z.string().nullable(),
});
export const factOpexTxn = z.object({
  txn_id: z.string(),
  period,
  entity_id: id('E-'),
  cost_center: z.string(),
  account_id: z.string().regex(/^\d{4}$/),
  vendor: z.string(),
  amount_inr: inr,
  discretionary: z.boolean(),
  pre_approved: z.boolean(),
});
export const factHeadcount = z.object({
  version_id: z.enum(['BUD_FY27', 'ACT_FY27']),
  period,
  entity_id: id('E-'),
  department: z.string(),
  headcount: z.number().int().positive(),
  cost_inr: inr.describe('Salaries and benefits; ties to GL account 6100'),
});
export const factSupplierSpend = z.object({
  period,
  supplier_id: id('S-'),
  entity_id: id('E-'),
  amount_inr: inr.describe('Ties to GL account 5000 (direct materials) actual'),
});
export const factDemandAssumption = z.object({
  version_id: z.enum(['BUD_FY27', 'FC_FY27_OCT', 'FC_FY27_NOV']),
  bu_id: id('BU-'),
  growth_bps: z.number().int().describe('Assumed year-on-year revenue growth, basis points'),
});
export const factForecastBridge = z.object({
  from_version_id: z.literal('FC_FY27_OCT'),
  to_version_id: z.literal('FC_FY27_NOV'),
  driver: z.enum(['DEMAND', 'FX', 'ORDER_DELAY']),
  sub_driver: z.enum(['VOLUME', 'PRICE', 'MIX', 'TIMING', 'RATE', 'SLIPPAGE', 'OUTLOOK']),
  period,
  entity_id: id('E-'),
  bu_id: id('BU-'),
  amount_inr: inr.describe('Signed revenue impact of the driver on this cell'),
});
export const factPlannerOverride = z.object({
  version_id: z.literal('FC_FY27_NOV'),
  period,
  entity_id: id('E-'),
  bu_id: id('BU-'),
  driver: z.literal('DEMAND'),
  delta_inr: inr.describe(
    'Manual planner adjustment, included inside the DEMAND bridge for this cell',
  ),
  role: z.string(),
  reason: z.string(),
});
export const dimAction = z.object({
  action_id: id('ACT-'),
  title: z.string(),
  driver_ref: z.string(),
  owner_role: z.string(),
  potential_inr: inr.describe('Proposed opportunity, not a guaranteed saving'),
  kind: z.enum(['TIMING_RECOVERY', 'RECURRING_SAVING', 'RECURRING_MARGIN', 'ONE_OFF_SAVING']),
  timeline_days: z.number().int(),
  implementation_cost_inr: inr,
  overlaps_with: z.string().nullable(),
  depends_on: z.string().nullable(),
  risk: z.string(),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export const TABLE_SCHEMAS = {
  dim_entity: dimEntity,
  dim_bu: dimBu,
  dim_product: dimProduct,
  dim_customer: dimCustomer,
  dim_account: dimAccount,
  dim_period: dimPeriod,
  dim_version: dimVersion,
  dim_supplier: dimSupplier,
  dim_action: dimAction,
  fx_rate: fxRate,
  fact_gl: factGl,
  fact_sales_line: factSalesLine,
  fact_order_book: factOrderBook,
  fact_opex_txn: factOpexTxn,
  fact_headcount: factHeadcount,
  fact_supplier_spend: factSupplierSpend,
  fact_demand_assumption: factDemandAssumption,
  fact_forecast_bridge: factForecastBridge,
  fact_planner_override: factPlannerOverride,
} as const;

export type TableName = keyof typeof TABLE_SCHEMAS;
export const TABLE_NAMES = Object.keys(TABLE_SCHEMAS) as TableName[];
