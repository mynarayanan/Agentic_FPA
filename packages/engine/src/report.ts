import { bridgeForEntity, revenueBridge } from './bridge';
import type { RevenueBridge, SalesLineInput } from './bridge';
import { accountVariances, pnlVariance } from './pnl';
import type { AccountInput, AccountVariance, GlRowInput, PnlVariance } from './pnl';
import { calcRegistry } from './registry';

export interface Names {
  accounts: Record<string, string>;
  bus: Record<string, string>;
  entities: Record<string, string>;
}

export interface VarianceReport {
  period: string;
  entity_id: string | null;
  actual_version: string;
  budget_version: string;
  pnl: PnlVariance;
  accounts: AccountVariance[];
  /** Present only for periods with sales-line detail. */
  revenue_bridge: RevenueBridge | null;
  calc_refs: Array<{ id: string; version: string }>;
  /** Display names for ids, when known. */
  names: Names | null;
}

export interface ReportInput {
  period: string;
  entity?: string | null;
  actualVersion: string;
  budgetVersion: string;
  /** GL rows already filtered to the period (and entity, if any). */
  actualGl: GlRowInput[];
  budgetGl: GlRowInput[];
  accounts: AccountInput[];
  /** Group-wide sales lines for the period. The bridge is computed on the group, then sliced for an entity. */
  actualLines?: SalesLineInput[];
  budgetLines?: SalesLineInput[];
  names?: Names;
}

/** Assemble the full actual-vs-budget report from raw rows. Null when either side has no data. */
export function buildVarianceReport(i: ReportInput): VarianceReport | null {
  if (i.actualGl.length === 0 || i.budgetGl.length === 0) return null;
  const al = i.actualLines ?? [];
  const bl = i.budgetLines ?? [];
  const group = al.length > 0 && bl.length > 0 ? revenueBridge(bl, al) : null;
  const bridge = group && i.entity ? bridgeForEntity(group, i.entity) : group;
  const ids = ['VAR-PNL-001', 'VAR-OPX-001', ...(bridge ? ['VAR-REV-002'] : [])];
  return {
    period: i.period,
    entity_id: i.entity ?? null,
    actual_version: i.actualVersion,
    budget_version: i.budgetVersion,
    pnl: pnlVariance(i.actualGl, i.budgetGl, i.accounts),
    accounts: accountVariances(i.actualGl, i.budgetGl, i.accounts),
    revenue_bridge: bridge,
    calc_refs: calcRegistry
      .filter((c) => ids.includes(c.id))
      .map((c) => ({ id: c.id, version: c.version })),
    names: i.names ?? null,
  };
}
