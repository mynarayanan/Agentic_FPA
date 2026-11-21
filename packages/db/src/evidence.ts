import { sql } from 'drizzle-orm';
import type { VarianceReport } from '@fpa/engine';
import { rowsOf } from './client';
import type { Db } from './client';

export interface EvidenceItem {
  label: string;
  value_inr: number | null;
  count: number | null;
  bps: number | null;
  /** Where the figure comes from, for the audit trail. */
  source: string;
}

const item = (
  label: string,
  source: string,
  p: Partial<Pick<EvidenceItem, 'value_inr' | 'count' | 'bps'>>,
): EvidenceItem => ({
  label,
  source,
  value_inr: p.value_inr ?? null,
  count: p.count ?? null,
  bps: p.bps ?? null,
});

async function one(db: Db, q: ReturnType<typeof sql>): Promise<{ c: number; v: number }> {
  const [r] = rowsOf<{ c: string | number | null; v: string | number | null }>(await db.execute(q));
  return { c: Number(r?.c ?? 0), v: Number(r?.v ?? 0) };
}

/**
 * Source-data evidence that backs each corrective action, read straight from the database tables.
 * These are facts to show an approver; they are not inputs to the impact calculation.
 */
export async function collectEvidence(
  db: Db,
  report: VarianceReport,
  fyEnd: string,
): Promise<Record<string, EvidenceItem[]>> {
  const out: Record<string, EvidenceItem[]> = {};

  const slipped = await one(
    db,
    sql`select count(*)::int as c, coalesce(sum(value_inr), 0)::text as v from fact_order_book
    where status = 'CONFIRMED' and original_delivery_period <> current_delivery_period and current_delivery_period > ${fyEnd}`,
  );
  const moved = await one(
    db,
    sql`select count(*)::int as c, coalesce(sum(value_inr), 0)::text as v from fact_order_book
    where status = 'CONFIRMED' and original_delivery_period <> current_delivery_period and current_delivery_period <= ${fyEnd}`,
  );
  out['ACT-001'] = [
    item('Confirmed orders pushed past the financial year end', 'fact_order_book', {
      value_inr: slipped.v,
      count: slipped.c,
    }),
    item('Confirmed orders delayed but still within the year', 'fact_order_book', {
      value_inr: moved.v,
      count: moved.c,
    }),
    ...(report.revenue_bridge
      ? [
          item('Timing effect on revenue this period', 'revenue bridge VAR-REV-002', {
            value_inr: report.revenue_bridge.timing,
          }),
        ]
      : []),
  ];

  const disc = rowsOf<{ account_id: string }>(
    await db.execute(sql`select account_id from dim_account where discretionary`),
  ).map((r) => r.account_id);
  const discVar = report.accounts
    .filter((a) => disc.includes(a.account_id))
    .reduce((s, a) => s + a.variance, 0);
  const unapproved = await one(
    db,
    sql`select count(*)::int as c, coalesce(sum(amount_inr), 0)::text as v from fact_opex_txn where period = ${report.period} and not pre_approved`,
  );
  out['ACT-002'] = [
    item(
      'Travel, consulting and contractor spend above budget this period',
      'variance by account VAR-OPX-001',
      { value_inr: discVar },
    ),
    item('Discretionary transactions without pre-approval', 'fact_opex_txn', {
      value_inr: unapproved.v,
      count: unapproved.c,
    }),
  ];

  const spread = await one(
    db,
    sql`select 1 as c, coalesce(max(std_margin_bps) - min(std_margin_bps), 0)::text as v from dim_product where bu_id = 'BU-IE'`,
  );
  out['ACT-003'] = [
    ...(report.revenue_bridge
      ? [
          item('Product mix effect on revenue this period', 'revenue bridge VAR-REV-002', {
            value_inr: report.revenue_bridge.mix,
          }),
        ]
      : []),
    item('Standard margin spread across Industrial Equipment products', 'dim_product', {
      bps: spread.v,
    }),
  ];

  const sup = await one(
    db,
    sql`select count(*)::int as c, coalesce(avg(price_escalation_bps), 0)::text as v from dim_supplier where renegotiation_candidate`,
  );
  const spend = await one(
    db,
    sql`select count(distinct s.supplier_id)::int as c, coalesce(sum(f.amount_inr), 0)::text as v from fact_supplier_spend f
    join dim_supplier s on s.supplier_id = f.supplier_id where s.renegotiation_candidate and f.period = ${report.period}`,
  );
  out['ACT-004'] = [
    item(
      'Suppliers flagged for renegotiation (high escalation, alternatives available)',
      'dim_supplier',
      { count: sup.c, bps: Math.round(sup.v) },
    ),
    item('Spend with those suppliers this period', 'fact_supplier_spend', {
      value_inr: spend.v,
      count: spend.c,
    }),
  ];
  return out;
}
