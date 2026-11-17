import { allocate, roundDiv } from './allocate';
import { assertRupees } from './money';
import type { Rupees } from './money';

export interface SalesLineInput {
  line_key: string;
  entity_id: string;
  bu_id: string;
  quantity: number;
  list_price_inr: number;
  discount_inr: number;
  net_amount_inr: number;
  delayed_to_period: string | null;
}

export interface BridgeCell {
  entity_id: string;
  bu_id: string;
  timing: Rupees;
  price: Rupees;
  volume: Rupees;
  mix: Rupees;
  total: Rupees;
  budget: Rupees;
  actual: Rupees;
  /** Units on lines delivered in the period (delayed lines excluded). */
  units_budget: number;
  units_actual: number;
}
export interface BridgeBu {
  bu_id: string;
  volume: Rupees;
  mix: Rupees;
  /** Change in delivered units versus budget, basis points (e.g. -1245 = -12.45%). Null if no budget units. */
  unit_change_bps: number | null;
}
export interface RevenueBridge {
  budget: Rupees;
  actual: Rupees;
  timing: Rupees;
  price: Rupees;
  volume: Rupees;
  mix: Rupees;
  total: Rupees;
  cells: BridgeCell[];
  byBu: BridgeBu[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * VAR-REV-002 - Revenue bridge (timing, price, volume, mix) between a budget and an actual set of
 * sales lines matched on line_key. See docs/methodology.md#revenue-bridge. The four effects always
 * sum exactly to actual - budget.
 */
export function revenueBridge(
  budgetLines: SalesLineInput[],
  actualLines: SalesLineInput[],
): RevenueBridge {
  const bud = new Map<string, SalesLineInput>();
  for (const b of budgetLines) {
    if (bud.has(b.line_key)) throw new Error(`duplicate budget line ${b.line_key}`);
    bud.set(b.line_key, b);
  }
  const seen = new Set<string>();
  const cellMap = new Map<string, BridgeCell & { dv: number }>();
  const cell = (e: string, b: string): BridgeCell & { dv: number } => {
    const k = `${e}|${b}`;
    let c = cellMap.get(k);
    if (!c) {
      c = {
        entity_id: e,
        bu_id: b,
        timing: 0,
        price: 0,
        volume: 0,
        mix: 0,
        total: 0,
        budget: 0,
        actual: 0,
        units_budget: 0,
        units_actual: 0,
        dv: 0,
      };
      cellMap.set(k, c);
    }
    return c;
  };
  const buAcc = new Map<
    string,
    { dq: number; q: number; r: number; entities: Map<string, number> }
  >();
  let budgetTotal = 0;
  let actualTotal = 0;

  for (const a of [...actualLines].sort((x, y) => cmp(x.line_key, y.line_key))) {
    const b = bud.get(a.line_key);
    if (!b) throw new Error(`actual line ${a.line_key} has no budget line`);
    if (seen.has(a.line_key)) throw new Error(`duplicate actual line ${a.line_key}`);
    seen.add(a.line_key);
    for (const v of [
      a.net_amount_inr,
      b.net_amount_inr,
      a.quantity,
      b.quantity,
      a.list_price_inr,
      b.list_price_inr,
    ])
      assertRupees(v);
    if (a.entity_id !== b.entity_id || a.bu_id !== b.bu_id)
      throw new Error(`line ${a.line_key} changed entity or BU`);

    budgetTotal += b.net_amount_inr;
    actualTotal += a.net_amount_inr;
    const c = cell(b.entity_id, b.bu_id);
    c.budget += b.net_amount_inr;
    c.actual += a.net_amount_inr;
    if (a.delayed_to_period !== null) {
      c.timing += a.net_amount_inr - b.net_amount_inr;
      continue;
    }
    c.units_budget += b.quantity;
    c.units_actual += a.quantity;
    c.price += a.net_amount_inr - a.quantity * b.list_price_inr;
    const dv = (a.quantity - b.quantity) * b.list_price_inr;
    c.dv += dv;
    let acc = buAcc.get(b.bu_id);
    if (!acc) {
      acc = { dq: 0, q: 0, r: 0, entities: new Map() };
      buAcc.set(b.bu_id, acc);
    }
    acc.dq += a.quantity - b.quantity;
    acc.q += b.quantity;
    acc.r += b.net_amount_inr;
    acc.entities.set(b.entity_id, (acc.entities.get(b.entity_id) ?? 0) + b.net_amount_inr);
  }
  for (const k of bud.keys())
    if (!seen.has(k)) throw new Error(`budget line ${k} has no actual line`);

  const byBu: BridgeBu[] = [];
  for (const bu of [...buAcc.keys()].sort(cmp)) {
    const acc = buAcc.get(bu) as NonNullable<ReturnType<typeof buAcc.get>>;
    const volume = acc.q === 0 ? 0 : roundDiv(BigInt(acc.dq) * BigInt(acc.r), BigInt(acc.q));
    const entities = [...acc.entities.keys()].sort(cmp);
    let parts = entities.map(() => 0);
    if (volume !== 0) {
      const byDv = entities.map((e) => Math.abs(cell(e, bu).dv));
      const w = byDv.every((x) => x === 0)
        ? entities.map((e) => acc.entities.get(e) as number)
        : byDv;
      parts = allocate(volume, w);
    }
    entities.forEach((e, i) => {
      const c = cell(e, bu);
      c.volume = parts[i] as number;
      c.mix = c.dv - c.volume;
    });
    byBu.push({
      bu_id: bu,
      volume,
      mix: entities.reduce((s, e) => s + cell(e, bu).mix, 0),
      unit_change_bps: acc.q === 0 ? null : roundDiv(BigInt(acc.dq) * 10000n, BigInt(acc.q)),
    });
  }

  const cells = [...cellMap.values()]
    .sort((x, y) => cmp(`${x.entity_id}|${x.bu_id}`, `${y.entity_id}|${y.bu_id}`))
    .map(({ dv: _dv, ...c }) => ({ ...c, total: c.timing + c.price + c.volume + c.mix }));
  const sum = (f: (c: BridgeCell) => number): number => cells.reduce((s, c) => s + f(c), 0);
  const out: RevenueBridge = {
    budget: budgetTotal,
    actual: actualTotal,
    timing: sum((c) => c.timing),
    price: sum((c) => c.price),
    volume: sum((c) => c.volume),
    mix: sum((c) => c.mix),
    total: sum((c) => c.total),
    cells,
    byBu,
  };
  if (out.total !== actualTotal - budgetTotal)
    throw new Error('bridge does not reconcile to actual - budget');
  return out;
}

/**
 * Drill-down view of one entity as a SLICE of the group bridge. Pure volume is computed once per
 * business unit across all entities, so entity views always add up to the group (see methodology).
 */
export function bridgeForEntity(bridge: RevenueBridge, entityId: string): RevenueBridge {
  const cells = bridge.cells.filter((c) => c.entity_id === entityId);
  const sum = (f: (c: BridgeCell) => number): number => cells.reduce((s, c) => s + f(c), 0);
  const byBu: BridgeBu[] = [...new Set(cells.map((c) => c.bu_id))].sort(cmp).map((bu) => {
    const mine = cells.filter((c) => c.bu_id === bu);
    const ub = mine.reduce((s, c) => s + c.units_budget, 0);
    const ua = mine.reduce((s, c) => s + c.units_actual, 0);
    return {
      bu_id: bu,
      volume: mine.reduce((s, c) => s + c.volume, 0),
      mix: mine.reduce((s, c) => s + c.mix, 0),
      unit_change_bps: ub === 0 ? null : roundDiv(BigInt(ua - ub) * 10000n, BigInt(ub)),
    };
  });
  return {
    budget: sum((c) => c.budget),
    actual: sum((c) => c.actual),
    timing: sum((c) => c.timing),
    price: sum((c) => c.price),
    volume: sum((c) => c.volume),
    mix: sum((c) => c.mix),
    total: sum((c) => c.total),
    cells,
    byBu,
  };
}
