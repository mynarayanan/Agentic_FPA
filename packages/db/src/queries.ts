import { and, eq } from 'drizzle-orm';
import { buildVarianceReport } from '@fpa/engine';
import type { AccountInput, GlRowInput, Names, SalesLineInput, VarianceReport } from '@fpa/engine';
import type { Db } from './client';
import { dimAccount, dimBu, dimEntity, factGl, factSalesLine } from './schema';

export const ACTUAL_VERSION = 'ACT_FY27';
export const BUDGET_VERSION = 'BUD_FY27';

export async function fetchAccounts(db: Db): Promise<AccountInput[]> {
  const rows = await db
    .select({ account_id: dimAccount.account_id, type: dimAccount.type, name: dimAccount.name })
    .from(dimAccount);
  return rows.map((r) => ({
    account_id: r.account_id,
    type: r.type as AccountInput['type'],
    name: r.name,
  }));
}

export async function fetchGl(
  db: Db,
  version: string,
  period: string,
  entity?: string,
): Promise<GlRowInput[]> {
  const where = and(
    eq(factGl.version_id, version),
    eq(factGl.period, period),
    entity ? eq(factGl.entity_id, entity) : undefined,
  );
  return db
    .select({ account_id: factGl.account_id, amount_inr: factGl.amount_inr })
    .from(factGl)
    .where(where);
}

export async function fetchSalesLines(
  db: Db,
  version: string,
  period: string,
  entity?: string,
): Promise<SalesLineInput[]> {
  const where = and(
    eq(factSalesLine.version_id, version),
    eq(factSalesLine.period, period),
    entity ? eq(factSalesLine.entity_id, entity) : undefined,
  );
  return db
    .select({
      line_key: factSalesLine.line_key,
      entity_id: factSalesLine.entity_id,
      bu_id: factSalesLine.bu_id,
      quantity: factSalesLine.quantity,
      list_price_inr: factSalesLine.list_price_inr,
      discount_inr: factSalesLine.discount_inr,
      net_amount_inr: factSalesLine.net_amount_inr,
      delayed_to_period: factSalesLine.delayed_to_period,
    })
    .from(factSalesLine)
    .where(where);
}

export type { VarianceReport } from '@fpa/engine';

export async function fetchNames(db: Db): Promise<Names> {
  const [a, b, e] = await Promise.all([
    db.select({ id: dimAccount.account_id, name: dimAccount.name }).from(dimAccount),
    db.select({ id: dimBu.bu_id, name: dimBu.name }).from(dimBu),
    db.select({ id: dimEntity.entity_id, name: dimEntity.name }).from(dimEntity),
  ]);
  const map = (rows: Array<{ id: string; name: string }>): Record<string, string> =>
    Object.fromEntries(rows.map((r) => [r.id, r.name]));
  return { accounts: map(a), bus: map(b), entities: map(e) };
}

/** Actual vs budget for one period (optionally one entity), computed by the deterministic engine. Null if there is no data. */
export async function varianceReport(
  db: Db,
  opts: { period: string; entity?: string },
): Promise<VarianceReport | null> {
  const [actualGl, budgetGl, accounts, names] = await Promise.all([
    fetchGl(db, ACTUAL_VERSION, opts.period, opts.entity),
    fetchGl(db, BUDGET_VERSION, opts.period, opts.entity),
    fetchAccounts(db),
    fetchNames(db),
  ]);
  // The bridge is always computed on the whole group, then sliced, so entity views add up to the group.
  const [actualLines, budgetLines] = await Promise.all([
    fetchSalesLines(db, ACTUAL_VERSION, opts.period),
    fetchSalesLines(db, BUDGET_VERSION, opts.period),
  ]);
  return buildVarianceReport({
    period: opts.period,
    entity: opts.entity,
    actualVersion: ACTUAL_VERSION,
    budgetVersion: BUDGET_VERSION,
    actualGl,
    budgetGl,
    accounts,
    actualLines,
    budgetLines,
    names,
  });
}
