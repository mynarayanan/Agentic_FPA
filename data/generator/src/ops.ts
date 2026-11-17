import { allocate } from './alloc';
import { ENTITY_IDS, FY27, PRODUCTS } from './dims';
import type { Row } from './dims';
import type { Rng } from './prng';
import { NOV_DELAYED } from './sales';
import { lakh } from './units';

type Cust = { customer_id: string; entity_id: string; segment: string };
const price = new Map<string, number>(PRODUCTS.map((p) => [p.sku_id, p.budget_list_price_inr]));

export const sumGl = (gl: Row[], f: (r: Row) => boolean): number =>
  gl.filter(f).reduce((a, r) => a + (r.amount_inr as number), 0);

export function buildOrders(rng: Rng, customers: Cust[]): Row[] {
  const ent = new Map(customers.map((c) => [c.customer_id, c.entity_id]));
  const rows: Row[] = [];
  for (const d of NOV_DELAYED) {
    rows.push({
      order_id: d.order,
      customer_id: d.customer,
      entity_id: ent.get(d.customer),
      sku_id: 'IE-300',
      quantity: d.qty,
      value_inr: d.qty * 500_000,
      original_delivery_period: '2026-11',
      current_delivery_period: '2026-12',
      status: 'CONFIRMED',
      delay_reason: 'Customer deferred acceptance by about four weeks',
    });
  }
  const slipped: Array<[string, string, number]> = [
    ['SO-SL-001', 'C-IN-01', 120],
    ['SO-SL-002', 'C-EU-01', 110],
    ['SO-SL-003', 'C-NA-01', 70],
  ];
  for (const [id, c, q] of slipped) {
    rows.push({
      order_id: id,
      customer_id: c,
      entity_id: ent.get(c),
      sku_id: 'IE-300',
      quantity: q,
      value_inr: q * 500_000,
      original_delivery_period: '2026-12',
      current_delivery_period: '2027-04',
      status: 'CONFIRMED',
      delay_reason: 'Customer site not ready; delivery schedule moved to next financial year',
    });
  }
  const skus = PRODUCTS.filter((p) => p.sku_id !== 'SV-900');
  for (let i = 1; i <= 28; i++) {
    const c = rng.pick(customers);
    const p = rng.pick(skus);
    const qty = Math.max(1, Math.round(lakh(rng.int(10, 80)) / p.budget_list_price_inr));
    const per = rng.pick(FY27.slice(8));
    rows.push({
      order_id: `SO-OP-${String(i).padStart(3, '0')}`,
      customer_id: c.customer_id,
      entity_id: c.entity_id,
      sku_id: p.sku_id,
      quantity: qty,
      value_inr: qty * (price.get(p.sku_id) as number),
      original_delivery_period: per,
      current_delivery_period: per,
      status: rng.chance(0.7) ? 'CONFIRMED' : 'PIPELINE',
      delay_reason: null,
    });
  }
  return rows;
}

export function buildOpexTxns(rng: Rng, gl: Row[]): Row[] {
  const spec: Record<
    string,
    { counts: Record<string, number>; vendors: string[]; approved: number }
  > = {
    '6200': {
      counts: { 'E-IN': 40, 'E-EU': 25, 'E-NA': 20 },
      vendors: ['SkyRoute Travel', 'Business Stay Group', 'Metro Cabs', 'Corporate Air Desk'],
      approved: 0.78,
    },
    '6300': {
      counts: { 'E-IN': 10, 'E-EU': 8, 'E-NA': 6 },
      vendors: [
        'Northbridge Advisory',
        'Clearpath Consulting',
        'Lexon Professional Services',
        'Insight Partners Group',
      ],
      approved: 0.6,
    },
    '6400': {
      counts: { 'E-IN': 18, 'E-EU': 12, 'E-NA': 10 },
      vendors: [
        'Talent Bridge Staffing',
        'FlexWorks Contractors',
        'Skillgrid Resourcing',
        'ProCrew Services',
      ],
      approved: 0.7,
    },
  };
  const depts = ['SALES', 'OPS', 'RND', 'ADMIN'];
  const rows: Row[] = [];
  let n = 0;
  for (const [account, s] of Object.entries(spec)) {
    for (const e of ENTITY_IDS) {
      const total = sumGl(
        gl,
        (r) =>
          r.version_id === 'ACT_FY27' &&
          r.period === '2026-11' &&
          r.entity_id === e &&
          r.account_id === account,
      );
      const count = s.counts[e] as number;
      const parts = allocate(
        total,
        Array.from({ length: count }, () => rng.float(0.2, 3)),
      );
      parts.forEach((amt) => {
        n += 1;
        rows.push({
          txn_id: `TX-${String(n).padStart(5, '0')}`,
          period: '2026-11',
          entity_id: e,
          cost_center: `CC-${e.slice(2)}-${rng.pick(depts)}`,
          account_id: account,
          vendor: rng.pick(s.vendors),
          amount_inr: amt,
          discretionary: true,
          pre_approved: rng.chance(s.approved),
        });
      });
    }
  }
  return rows;
}

export function buildHeadcount(rng: Rng, gl: Row[]): Row[] {
  const dept: Array<[string, number, number]> = [
    ['Sales', 25, 1.1],
    ['Operations', 35, 0.8],
    ['R&D', 15, 1.2],
    ['Finance & Admin', 10, 1.0],
    ['IT', 10, 1.1],
    ['Other', 5, 0.9],
  ];
  const avg: Record<string, number> = { 'E-IN': 85_000, 'E-EU': 520_000, 'E-NA': 600_000 };
  const rows: Row[] = [];
  for (const [version, periods] of [
    ['BUD_FY27', FY27],
    ['ACT_FY27', FY27.slice(0, 8)],
  ] as const) {
    for (const p of periods) {
      for (const e of ENTITY_IDS) {
        const total = sumGl(
          gl,
          (r) =>
            r.version_id === version &&
            r.period === p &&
            r.entity_id === e &&
            r.account_id === '6100',
        );
        const parts = allocate(
          total,
          dept.map((d) => d[1] * (version === 'ACT_FY27' ? 1 + rng.float(-0.03, 0.03) : 1)),
        );
        dept.forEach((d, i) => {
          const cost = parts[i] as number;
          rows.push({
            version_id: version,
            period: p,
            entity_id: e,
            department: d[0],
            headcount: Math.max(1, Math.round(cost / ((avg[e] as number) * d[2]))),
            cost_inr: cost,
          });
        });
      }
    }
  }
  return rows;
}

const SUPPLIERS: Array<[string, string]> = [
  ['Forgeline Castings', 'Steel & Castings'],
  ['Alloy Dynamics', 'Steel & Castings'],
  ['Ridgeback Steel Works', 'Steel & Castings'],
  ['Circuitry Partners', 'Electronics'],
  ['Voltix Components', 'Electronics'],
  ['Signalcore Electronics', 'Electronics'],
  ['Precision Bearings Co', 'Bearings'],
  ['Rollwell Bearings', 'Bearings'],
  ['Axis Bearing Group', 'Bearings'],
  ['Torquemaster Motors', 'Motors & Drives'],
  ['Driveline Systems', 'Motors & Drives'],
  ['Amperage Drives', 'Motors & Drives'],
  ['Hydrotech Fluid Power', 'Hydraulics'],
  ['Pressline Hydraulics', 'Hydraulics'],
  ['Flowright Valves', 'Hydraulics'],
  ['Boltwise Fasteners', 'Fasteners'],
  ['Anchor & Thread', 'Fasteners'],
  ['Clampline Industrial', 'Fasteners'],
  ['Packwell Solutions', 'Packaging'],
  ['Crateworks', 'Packaging'],
  ['Safepack Industrial', 'Packaging'],
  ['Swiftmove Freight', 'Logistics'],
  ['Oceanic Cargo Lines', 'Logistics'],
  ['Interland Haulage', 'Logistics'],
];

export function buildSuppliers(rng: Rng): Row[] {
  const months = [
    '2026-12',
    '2027-01',
    '2027-03',
    '2027-06',
    '2027-09',
    '2027-12',
    '2028-03',
    '2028-06',
  ];
  return SUPPLIERS.map(([name, category], i) => {
    const target = i < 5;
    return {
      supplier_id: `S-${String(i + 1).padStart(3, '0')}`,
      name,
      category,
      contract_end_period: rng.pick(months),
      price_escalation_bps: target ? rng.int(650, 950) : rng.int(150, 550),
      quality_score: rng.int(72, 98),
      alt_sources: target ? rng.int(1, 4) : rng.int(0, 3),
      renegotiation_candidate: target,
    };
  });
}

export function buildSupplierSpend(rng: Rng, gl: Row[], suppliers: Row[]): Row[] {
  const rows: Row[] = [];
  for (const e of ENTITY_IDS) {
    const total = sumGl(
      gl,
      (r) =>
        r.version_id === 'ACT_FY27' &&
        r.period === '2026-11' &&
        r.entity_id === e &&
        r.account_id === '5000',
    );
    const chosen = rng.shuffle(suppliers).slice(0, rng.int(12, 18));
    const parts = allocate(
      total,
      chosen.map(() => rng.float(0.3, 3)),
    );
    chosen.forEach((s, i) =>
      rows.push({
        period: '2026-11',
        supplier_id: s.supplier_id,
        entity_id: e,
        amount_inr: parts[i] as number,
      }),
    );
  }
  return rows;
}

export const DEMAND_ASSUMPTIONS: Row[] = (() => {
  const base: Record<string, number> = {
    'BU-IE': 800,
    'BU-AU': 800,
    'BU-CP': 600,
    'BU-SV': 500,
    'BU-EN': 700,
  };
  const out: Row[] = [];
  for (const v of ['BUD_FY27', 'FC_FY27_OCT', 'FC_FY27_NOV']) {
    for (const [bu, g] of Object.entries(base)) {
      out.push({
        version_id: v,
        bu_id: bu,
        growth_bps: v === 'FC_FY27_NOV' && (bu === 'BU-IE' || bu === 'BU-AU') ? 300 : g,
      });
    }
  }
  return out;
})();
