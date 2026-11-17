import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  index,
} from 'drizzle-orm/pg-core';
import type { TableName } from '@fpa/semantic';

/** Amounts are integer rupees. bigint (number mode, safe up to 9e15) gives headroom: a 32-bit int caps at about 214 Cr. */
const inr = (name: string) => bigint(name, { mode: 'number' }).notNull();
const t = (name: string) => text(name).notNull();

export const dimEntity = pgTable('dim_entity', {
  entity_id: text('entity_id').primaryKey(),
  name: t('name'),
  country: t('country'),
  functional_currency: t('functional_currency'),
});
export const dimBu = pgTable('dim_bu', { bu_id: text('bu_id').primaryKey(), name: t('name') });
export const dimProduct = pgTable('dim_product', {
  sku_id: text('sku_id').primaryKey(),
  name: t('name'),
  bu_id: t('bu_id').references(() => dimBu.bu_id),
  budget_list_price_inr: inr('budget_list_price_inr'),
  std_margin_bps: integer('std_margin_bps').notNull(),
});
export const dimCustomer = pgTable('dim_customer', {
  customer_id: text('customer_id').primaryKey(),
  name: t('name'),
  entity_id: t('entity_id').references(() => dimEntity.entity_id),
  region: t('region'),
  segment: t('segment'),
});
export const dimAccount = pgTable('dim_account', {
  account_id: text('account_id').primaryKey(),
  name: t('name'),
  type: t('type'),
  grp: t('grp'),
  discretionary: boolean('discretionary').notNull(),
});
export const dimPeriod = pgTable('dim_period', {
  period: text('period').primaryKey(),
  fiscal_year: t('fiscal_year'),
  fiscal_month: integer('fiscal_month').notNull(),
  is_closed_actual: boolean('is_closed_actual').notNull(),
});
export const dimVersion = pgTable('dim_version', {
  version_id: text('version_id').primaryKey(),
  name: t('name'),
  kind: t('kind'),
  fiscal_year: t('fiscal_year'),
  as_of_period: text('as_of_period'),
});
export const dimSupplier = pgTable('dim_supplier', {
  supplier_id: text('supplier_id').primaryKey(),
  name: t('name'),
  category: t('category'),
  contract_end_period: t('contract_end_period'),
  price_escalation_bps: integer('price_escalation_bps').notNull(),
  quality_score: integer('quality_score').notNull(),
  alt_sources: integer('alt_sources').notNull(),
  renegotiation_candidate: boolean('renegotiation_candidate').notNull(),
});
export const dimAction = pgTable('dim_action', {
  action_id: text('action_id').primaryKey(),
  title: t('title'),
  driver_ref: t('driver_ref'),
  owner_role: t('owner_role'),
  potential_inr: inr('potential_inr'),
  kind: t('kind'),
  timeline_days: integer('timeline_days').notNull(),
  implementation_cost_inr: inr('implementation_cost_inr'),
  overlaps_with: text('overlaps_with'),
  depends_on: text('depends_on'),
  risk: t('risk'),
  confidence: t('confidence'),
});
export const fxRate = pgTable(
  'fx_rate',
  {
    version_id: t('version_id').references(() => dimVersion.version_id),
    period: t('period').references(() => dimPeriod.period),
    currency: t('currency'),
    rate_inr: doublePrecision('rate_inr').notNull(),
  },
  (x) => [primaryKey({ columns: [x.version_id, x.period, x.currency] })],
);
export const factGl = pgTable(
  'fact_gl',
  {
    version_id: t('version_id').references(() => dimVersion.version_id),
    period: t('period').references(() => dimPeriod.period),
    entity_id: t('entity_id').references(() => dimEntity.entity_id),
    bu_id: t('bu_id').references(() => dimBu.bu_id),
    account_id: t('account_id').references(() => dimAccount.account_id),
    amount_inr: inr('amount_inr'),
  },
  (x) => [
    primaryKey({ columns: [x.version_id, x.period, x.entity_id, x.bu_id, x.account_id] }),
    index('fact_gl_period_idx').on(x.period, x.version_id),
  ],
);
export const factSalesLine = pgTable(
  'fact_sales_line',
  {
    line_key: t('line_key'),
    version_id: t('version_id').references(() => dimVersion.version_id),
    period: t('period').references(() => dimPeriod.period),
    entity_id: t('entity_id').references(() => dimEntity.entity_id),
    customer_id: t('customer_id').references(() => dimCustomer.customer_id),
    sku_id: t('sku_id').references(() => dimProduct.sku_id),
    bu_id: t('bu_id').references(() => dimBu.bu_id),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    list_price_inr: inr('list_price_inr'),
    gross_amount_inr: inr('gross_amount_inr'),
    discount_inr: inr('discount_inr'),
    net_amount_inr: inr('net_amount_inr'),
    order_id: text('order_id'),
    delayed_to_period: text('delayed_to_period'),
  },
  (x) => [primaryKey({ columns: [x.line_key, x.version_id] })],
);
export const factOrderBook = pgTable('fact_order_book', {
  order_id: text('order_id').primaryKey(),
  customer_id: t('customer_id').references(() => dimCustomer.customer_id),
  entity_id: t('entity_id').references(() => dimEntity.entity_id),
  sku_id: t('sku_id').references(() => dimProduct.sku_id),
  quantity: bigint('quantity', { mode: 'number' }).notNull(),
  value_inr: inr('value_inr'),
  original_delivery_period: t('original_delivery_period'),
  current_delivery_period: t('current_delivery_period'),
  status: t('status'),
  delay_reason: text('delay_reason'),
});
export const factOpexTxn = pgTable('fact_opex_txn', {
  txn_id: text('txn_id').primaryKey(),
  period: t('period').references(() => dimPeriod.period),
  entity_id: t('entity_id').references(() => dimEntity.entity_id),
  cost_center: t('cost_center'),
  account_id: t('account_id').references(() => dimAccount.account_id),
  vendor: t('vendor'),
  amount_inr: inr('amount_inr'),
  discretionary: boolean('discretionary').notNull(),
  pre_approved: boolean('pre_approved').notNull(),
});
export const factHeadcount = pgTable(
  'fact_headcount',
  {
    version_id: t('version_id').references(() => dimVersion.version_id),
    period: t('period').references(() => dimPeriod.period),
    entity_id: t('entity_id').references(() => dimEntity.entity_id),
    department: t('department'),
    headcount: integer('headcount').notNull(),
    cost_inr: inr('cost_inr'),
  },
  (x) => [primaryKey({ columns: [x.version_id, x.period, x.entity_id, x.department] })],
);
export const factSupplierSpend = pgTable(
  'fact_supplier_spend',
  {
    period: t('period').references(() => dimPeriod.period),
    supplier_id: t('supplier_id').references(() => dimSupplier.supplier_id),
    entity_id: t('entity_id').references(() => dimEntity.entity_id),
    amount_inr: inr('amount_inr'),
  },
  (x) => [primaryKey({ columns: [x.period, x.supplier_id, x.entity_id] })],
);
export const factDemandAssumption = pgTable(
  'fact_demand_assumption',
  {
    version_id: t('version_id').references(() => dimVersion.version_id),
    bu_id: t('bu_id').references(() => dimBu.bu_id),
    growth_bps: integer('growth_bps').notNull(),
  },
  (x) => [primaryKey({ columns: [x.version_id, x.bu_id] })],
);
export const factForecastBridge = pgTable(
  'fact_forecast_bridge',
  {
    from_version_id: t('from_version_id').references(() => dimVersion.version_id),
    to_version_id: t('to_version_id').references(() => dimVersion.version_id),
    driver: t('driver'),
    sub_driver: t('sub_driver'),
    period: t('period').references(() => dimPeriod.period),
    entity_id: t('entity_id').references(() => dimEntity.entity_id),
    bu_id: t('bu_id').references(() => dimBu.bu_id),
    amount_inr: inr('amount_inr'),
  },
  (x) => [primaryKey({ columns: [x.driver, x.sub_driver, x.period, x.entity_id, x.bu_id] })],
);
export const factPlannerOverride = pgTable(
  'fact_planner_override',
  {
    version_id: t('version_id').references(() => dimVersion.version_id),
    period: t('period').references(() => dimPeriod.period),
    entity_id: t('entity_id').references(() => dimEntity.entity_id),
    bu_id: t('bu_id').references(() => dimBu.bu_id),
    driver: t('driver'),
    delta_inr: inr('delta_inr'),
    role: t('role'),
    reason: t('reason'),
  },
  (x) => [primaryKey({ columns: [x.version_id, x.period, x.entity_id, x.bu_id] })],
);

/** One entry per semantic table. Order is dependency order: parents before children. */
export const TABLES = {
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
} satisfies Record<TableName, unknown>;
export const LOAD_ORDER = Object.keys(TABLES) as TableName[];
