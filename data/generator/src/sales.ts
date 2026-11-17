import { allocate, allocateCapped } from './alloc';
import { BALANCING_SKU, BU_IDS, BUS, NOV_BUDGET_BU_CR, PRODUCTS } from './dims';
import type { Row } from './dims';
import type { Rng } from './prng';
import { cr } from './units';

export interface Line {
  key: string;
  customer: string;
  entity: string;
  sku: string;
  bu: string;
  price: number;
  qb: number;
  qa: number;
  disc: number;
  orderId: string | null;
  delayed: boolean;
}

export interface CellBridge {
  timing: number;
  price: number;
  volume: number;
  mix: number;
}
export interface Bridge {
  timing: number;
  price: number;
  volume: number;
  mix: number;
  total: number;
  byCell: Map<string, CellBridge>;
  ieUnitDeclinePct: number;
}

export const cellKey = (entity: string, bu: string): string => `${entity}|${bu}`;
const PERIOD = '2026-11';
const price = new Map<string, number>(PRODUCTS.map((p) => [p.sku_id, p.budget_list_price_inr]));
const buOf = new Map<string, string>(PRODUCTS.map((p) => [p.sku_id, p.bu_id]));

/** The two strategic customers that deferred purchases in November. */
export const DEFERRING_CUSTOMERS = ['C-IN-01', 'C-EU-01'];
/** Nov orders that slipped into December (1 Cr in total). */
export const NOV_DELAYED = [
  { order: 'SO-DL-001', customer: 'C-IN-02', qty: 8 }, // 40 lakh
  { order: 'SO-DL-002', customer: 'C-EU-02', qty: 7 }, // 35 lakh
  { order: 'SO-DL-003', customer: 'C-NA-02', qty: 5 }, // 25 lakh
];

type Cust = { customer_id: string; entity_id: string; segment: string };

export function buildSales(rng: Rng, customers: Cust[]): Line[] {
  const cust = new Map(customers.map((c) => [c.customer_id, c]));
  const lines: Line[] = [];
  let seq = 0;
  const mk = (
    customer: string,
    sku: string,
    qb: number,
    orderId: string | null = null,
    delayed = false,
  ): void => {
    seq += 1;
    lines.push({
      key: `L-${String(seq).padStart(4, '0')}`,
      customer,
      entity: (cust.get(customer) as Cust).entity_id,
      sku,
      bu: buOf.get(sku) as string,
      price: price.get(sku) as number,
      qb,
      qa: qb,
      disc: 0,
      orderId,
      delayed,
    });
  };
  const rev = (l: Line): number => l.qb * l.price;
  const segW = (s: string): number => (s === 'Strategic' ? 4 : s === 'Key' ? 2 : 1);

  for (const d of NOV_DELAYED) mk(d.customer, 'IE-300', d.qty, d.order, true);

  for (const bu of BUS) {
    const skus = PRODUCTS.filter((p) => p.bu_id === bu.bu_id && p.sku_id !== BALANCING_SKU);
    const target = cr(NOV_BUDGET_BU_CR[bu.bu_id] as number);
    const existing = lines.filter((l) => l.bu === bu.bu_id).reduce((a, l) => a + rev(l), 0);
    const draft: Array<{ customer: string; sku: string; raw: number }> = [];
    for (const c of customers) {
      for (const s of skus) {
        if (lines.some((l) => l.customer === c.customer_id && l.sku === s.sku_id)) continue;
        if (c.segment !== 'Strategic' && !rng.chance(0.85)) continue;
        draft.push({
          customer: c.customer_id,
          sku: s.sku_id,
          raw: segW(c.segment) * rng.float(0.4, 1.8),
        });
      }
    }
    const sumRaw = draft.reduce((a, d) => a + d.raw, 0);
    for (const d of draft) {
      const p = price.get(d.sku) as number;
      mk(d.customer, d.sku, Math.max(1, Math.round(((d.raw / sumRaw) * (target - existing)) / p)));
    }
    const mine = lines.filter((l) => l.bu === bu.bu_id && !l.delayed);
    let total = lines.filter((l) => l.bu === bu.bu_id).reduce((a, l) => a + rev(l), 0);
    while (total > target) {
      const l = rng.pick(mine.filter((x) => x.qb > 1));
      l.qb -= 1;
      l.qa -= 1;
      total -= l.price;
    }
    const minPrice = Math.min(...skus.map((s) => s.budget_list_price_inr));
    while (target - total >= minPrice) {
      const l = rng.pick(mine.filter((x) => x.price <= target - total));
      l.qb += 1;
      l.qa += 1;
      total += l.price;
    }
  }
  const remainder = cr(100) - lines.reduce((a, l) => a + rev(l), 0);
  if (remainder < 0 || remainder % 1000 !== 0)
    throw new Error(`budget remainder invalid: ${remainder}`);
  if (remainder > 0) mk('C-IN-05', BALANCING_SKU, remainder / 1000);

  applyActuals(rng, lines, cust);
  return lines;
}

function applyActuals(rng: Rng, lines: Line[], cust: Map<string, Cust>): void {
  for (const l of lines) l.qa = l.delayed ? 0 : l.qb;
  const nd = lines.filter((l) => !l.delayed);

  // 1) Zero-sum customer noise: move units between customers of the same SKU in the same entity.
  const groups = new Map<string, Line[]>();
  for (const l of nd) {
    if (l.sku === BALANCING_SKU) continue;
    const k = `${l.sku}|${l.entity}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    for (let n = 0; n < Math.max(1, Math.round(g.length * 0.3)); n++) {
      const [a, b] = rng.shuffle(g);
      const max = Math.floor((a as Line).qa * 0.25);
      if (max < 1) continue;
      const k = rng.int(1, max);
      (a as Line).qa -= k;
      (b as Line).qa += k;
    }
  }

  // 2) Industrial Equipment volume decline and product mix, solved on integer units of 50,000.
  const ie = nd.filter((l) => l.bu === 'BU-IE');
  const tqb = ie.reduce((a, l) => a + l.qb, 0);
  const rb = ie.reduce((a, l) => a + l.qb * l.price, 0);
  const n0 = Math.round((-cr(4) * tqb) / rb);
  const UNIT = 50_000;
  const [p1, p2, p3] = ['IE-100', 'IE-200', 'IE-300'].map(
    (s) => (price.get(s) as number) / UNIT,
  ) as [number, number, number];
  const target = -cr(5) / UNIT; // total volume+mix effect of -5 Cr
  let N = n0;
  let found = false;
  for (let d = 0; d <= 6 && !found; d++) {
    for (const cand of d === 0 ? [n0] : [n0 + d, n0 - d]) {
      // a*p1 + b*p2 + c*p3 = target; a + b + c = cand; choose a, solve b and c.
      const a = Math.round(0.17 * Math.abs(cand));
      const rest = cand - a;
      const num = target - a * p1 - rest * p2;
      if (Number.isInteger(num / (p3 - p2))) {
        N = cand;
        found = true;
        break;
      }
    }
  }
  if (!found) throw new Error('could not solve IE mix equations');
  const a = Math.round(0.17 * Math.abs(N));
  const c = (target - a * p1 - (N - a) * p2) / (p3 - p2);
  const b = N - a - c;
  const delta: Record<string, number> = { 'IE-100': a, 'IE-200': b, 'IE-300': c };
  for (const [sku, d] of Object.entries(delta)) {
    const pool = ie.filter((l) => l.sku === sku);
    const w = pool.map((l) => l.qa * (DEFERRING_CUSTOMERS.includes(l.customer) ? 15 : 1));
    if (d < 0) {
      const take = allocateCapped(
        -d,
        w,
        pool.map((l) => l.qa),
      );
      pool.forEach((l, i) => (l.qa -= take[i] as number));
    } else if (d > 0) {
      const add = allocate(
        d,
        pool.map((l) => l.qa),
      ); // increases (downtrading) are not boosted for deferring customers
      pool.forEach((l, i) => (l.qa += add[i] as number));
    }
  }

  // 3) Price discounting: exactly 2 Cr, concentrated in Industrial Equipment and Automation.
  const pool = nd.filter((l) => (l.bu === 'BU-IE' || l.bu === 'BU-AU') && l.qa > 0);
  const segD = (l: Line): number =>
    (cust.get(l.customer) as Cust).segment === 'Strategic'
      ? 3
      : (cust.get(l.customer) as Cust).segment === 'Key'
        ? 1.5
        : 1;
  const gross = pool.map((l) => l.qa * l.price);
  const disc = allocateCapped(
    cr(2),
    pool.map((l, i) => (gross[i] as number) * segD(l)),
    gross.map((g) => Math.floor(g * 0.12)),
  );
  pool.forEach((l, i) => (l.disc = disc[i] as number));
}

/** Independent reference implementation of the Nov-2026 price/volume/mix/timing bridge (methodology v0.1). */
export function referenceBridge(lines: Line[]): Bridge {
  const byCell = new Map<string, CellBridge>();
  const get = (k: string): CellBridge => {
    if (!byCell.has(k)) byCell.set(k, { timing: 0, price: 0, volume: 0, mix: 0 });
    return byCell.get(k) as CellBridge;
  };
  const dv = new Map<string, number>();
  for (const l of lines) {
    const k = cellKey(l.entity, l.bu);
    const cell = get(k);
    if (l.delayed) {
      cell.timing += -(l.qb * l.price);
      continue;
    }
    cell.price += -l.disc;
    dv.set(k, (dv.get(k) ?? 0) + (l.qa - l.qb) * l.price);
  }
  for (const bu of BU_IDS) {
    const nd = lines.filter((l) => l.bu === bu && !l.delayed);
    const dq = nd.reduce((a, l) => a + (l.qa - l.qb), 0);
    const q = nd.reduce((a, l) => a + l.qb, 0);
    const r = nd.reduce((a, l) => a + l.qb * l.price, 0);
    const vBu = Math.round((dq * r) / q);
    const cells = [...new Set(nd.map((l) => l.entity))].sort();
    const w = cells.map((e) => Math.abs(dv.get(cellKey(e, bu)) ?? 0));
    const part = vBu === 0 || w.every((x) => x === 0) ? cells.map(() => 0) : allocate(vBu, w);
    cells.forEach((e, i) => {
      const cell = get(cellKey(e, bu));
      cell.volume = part[i] as number;
      cell.mix = (dv.get(cellKey(e, bu)) ?? 0) - cell.volume;
    });
  }
  const sum = (f: (c: CellBridge) => number): number =>
    [...byCell.values()].reduce((a, c) => a + f(c), 0);
  const ie = lines.filter((l) => l.bu === 'BU-IE' && !l.delayed);
  const ieQb = ie.reduce((a, l) => a + l.qb, 0);
  const ieQa = ie.reduce((a, l) => a + l.qa, 0);
  return {
    timing: sum((c) => c.timing),
    price: sum((c) => c.price),
    volume: sum((c) => c.volume),
    mix: sum((c) => c.mix),
    total: sum((c) => c.timing + c.price + c.volume + c.mix),
    byCell,
    ieUnitDeclinePct: Number((((ieQa - ieQb) / ieQb) * 100).toFixed(2)),
  };
}

export function cellRevenue(lines: Line[], view: 'bud' | 'act'): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    const v = view === 'bud' ? l.qb * l.price : l.qa * l.price - l.disc;
    m.set(cellKey(l.entity, l.bu), (m.get(cellKey(l.entity, l.bu)) ?? 0) + v);
  }
  return m;
}

export function salesRows(lines: Line[]): Row[] {
  const rows: Row[] = [];
  for (const l of lines) {
    rows.push({
      line_key: l.key,
      version_id: 'BUD_FY27',
      period: PERIOD,
      entity_id: l.entity,
      customer_id: l.customer,
      sku_id: l.sku,
      bu_id: l.bu,
      quantity: l.qb,
      list_price_inr: l.price,
      gross_amount_inr: l.qb * l.price,
      discount_inr: 0,
      net_amount_inr: l.qb * l.price,
      order_id: l.orderId,
      delayed_to_period: null,
    });
  }
  for (const l of lines) {
    rows.push({
      line_key: l.key,
      version_id: 'ACT_FY27',
      period: PERIOD,
      entity_id: l.entity,
      customer_id: l.customer,
      sku_id: l.sku,
      bu_id: l.bu,
      quantity: l.qa,
      list_price_inr: l.price,
      gross_amount_inr: l.qa * l.price,
      discount_inr: l.disc,
      net_amount_inr: l.qa * l.price - l.disc,
      order_id: l.orderId,
      delayed_to_period: l.delayed ? '2026-12' : null,
    });
  }
  return rows;
}
