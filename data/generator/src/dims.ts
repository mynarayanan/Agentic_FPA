import type { Rng } from './prng';
import { cr } from './units';

export type Row = Record<string, unknown>;

export const ENTITIES = [
  { entity_id: 'E-IN', name: 'India Manufacturing', country: 'IN', functional_currency: 'INR' },
  { entity_id: 'E-EU', name: 'Europe Manufacturing', country: 'DE', functional_currency: 'EUR' },
  {
    entity_id: 'E-NA',
    name: 'North America Manufacturing',
    country: 'US',
    functional_currency: 'USD',
  },
] as const;
export const ENTITY_IDS = ENTITIES.map((e) => e.entity_id);

export const BUS = [
  { bu_id: 'BU-IE', name: 'Industrial Equipment' },
  { bu_id: 'BU-AU', name: 'Automation Systems' },
  { bu_id: 'BU-CP', name: 'Components & Parts' },
  { bu_id: 'BU-SV', name: 'Services & Spares' },
  { bu_id: 'BU-EN', name: 'Energy Solutions' },
] as const;
export const BU_IDS = BUS.map((b) => b.bu_id);

/** Budget November 2026 revenue by BU, in crore (sums to 100). */
export const NOV_BUDGET_BU_CR: Record<string, number> = {
  'BU-IE': 33,
  'BU-AU': 24,
  'BU-CP': 15,
  'BU-SV': 13,
  'BU-EN': 15,
};

export const PRODUCTS = [
  {
    sku_id: 'IE-100',
    name: 'Compact Press 100',
    bu_id: 'BU-IE',
    budget_list_price_inr: 200_000,
    std_margin_bps: 2400,
  },
  {
    sku_id: 'IE-200',
    name: 'Industrial Press 200',
    bu_id: 'BU-IE',
    budget_list_price_inr: 350_000,
    std_margin_bps: 3000,
  },
  {
    sku_id: 'IE-300',
    name: 'Heavy Press 300',
    bu_id: 'BU-IE',
    budget_list_price_inr: 500_000,
    std_margin_bps: 3600,
  },
  {
    sku_id: 'AU-100',
    name: 'Controller Module 100',
    bu_id: 'BU-AU',
    budget_list_price_inr: 120_000,
    std_margin_bps: 3200,
  },
  {
    sku_id: 'AU-200',
    name: 'Line Automation Cell 200',
    bu_id: 'BU-AU',
    budget_list_price_inr: 240_000,
    std_margin_bps: 3400,
  },
  {
    sku_id: 'AU-300',
    name: 'Robotic Cell 300',
    bu_id: 'BU-AU',
    budget_list_price_inr: 400_000,
    std_margin_bps: 3800,
  },
  {
    sku_id: 'CP-100',
    name: 'Bearing Set 100',
    bu_id: 'BU-CP',
    budget_list_price_inr: 15_000,
    std_margin_bps: 2200,
  },
  {
    sku_id: 'CP-200',
    name: 'Gearbox 200',
    bu_id: 'BU-CP',
    budget_list_price_inr: 32_000,
    std_margin_bps: 2600,
  },
  {
    sku_id: 'CP-300',
    name: 'Hydraulic Pack 300',
    bu_id: 'BU-CP',
    budget_list_price_inr: 56_000,
    std_margin_bps: 2800,
  },
  {
    sku_id: 'SV-100',
    name: 'Annual Service Plan',
    bu_id: 'BU-SV',
    budget_list_price_inr: 8_000,
    std_margin_bps: 4200,
  },
  {
    sku_id: 'SV-200',
    name: 'Spares Kit',
    bu_id: 'BU-SV',
    budget_list_price_inr: 24_000,
    std_margin_bps: 3900,
  },
  {
    sku_id: 'SV-900',
    name: 'Consumables Pack',
    bu_id: 'BU-SV',
    budget_list_price_inr: 1_000,
    std_margin_bps: 3000,
  },
  {
    sku_id: 'EN-100',
    name: 'Solar Inverter 100',
    bu_id: 'BU-EN',
    budget_list_price_inr: 300_000,
    std_margin_bps: 2800,
  },
  {
    sku_id: 'EN-200',
    name: 'Energy Storage 200',
    bu_id: 'BU-EN',
    budget_list_price_inr: 450_000,
    std_margin_bps: 3100,
  },
] as const;
export const BALANCING_SKU = 'SV-900';

export const ACCOUNTS = [
  {
    account_id: '4000',
    name: 'Revenue - Product Sales',
    type: 'REVENUE',
    grp: 'Revenue',
    discretionary: false,
  },
  {
    account_id: '4100',
    name: 'Revenue - Services & Spares',
    type: 'REVENUE',
    grp: 'Revenue',
    discretionary: false,
  },
  {
    account_id: '5000',
    name: 'Direct Materials',
    type: 'COGS',
    grp: 'Other operating costs',
    discretionary: false,
  },
  {
    account_id: '5100',
    name: 'Direct Labour',
    type: 'COGS',
    grp: 'Other operating costs',
    discretionary: false,
  },
  {
    account_id: '5200',
    name: 'Manufacturing Overheads',
    type: 'COGS',
    grp: 'Other operating costs',
    discretionary: false,
  },
  {
    account_id: '5300',
    name: 'Freight & Logistics',
    type: 'COGS',
    grp: 'Other operating costs',
    discretionary: false,
  },
  {
    account_id: '6100',
    name: 'Salaries & Benefits',
    type: 'OPEX',
    grp: 'Operating expenses',
    discretionary: false,
  },
  {
    account_id: '6200',
    name: 'Travel',
    type: 'OPEX',
    grp: 'Operating expenses',
    discretionary: true,
  },
  {
    account_id: '6300',
    name: 'Consulting & Professional Fees',
    type: 'OPEX',
    grp: 'Operating expenses',
    discretionary: true,
  },
  {
    account_id: '6400',
    name: 'External Contractors',
    type: 'OPEX',
    grp: 'Operating expenses',
    discretionary: true,
  },
  {
    account_id: '6500',
    name: 'Marketing',
    type: 'OPEX',
    grp: 'Operating expenses',
    discretionary: false,
  },
  {
    account_id: '6600',
    name: 'IT & Software',
    type: 'OPEX',
    grp: 'Operating expenses',
    discretionary: false,
  },
  {
    account_id: '6700',
    name: 'Facilities',
    type: 'OPEX',
    grp: 'Operating expenses',
    discretionary: false,
  },
  {
    account_id: '6800',
    name: 'Other Operating Expenses',
    type: 'OPEX',
    grp: 'Operating expenses',
    discretionary: false,
  },
] as const;
export const COGS_ACCOUNTS = ['5000', '5100', '5200', '5300'] as const;
export const OPEX_ACCOUNTS = [
  '6100',
  '6200',
  '6300',
  '6400',
  '6500',
  '6600',
  '6700',
  '6800',
] as const;
export const revenueAccountFor = (bu: string): string => (bu === 'BU-SV' ? '4100' : '4000');

/** Nov-2026 anchor values (crore). Budget and actual operating costs are planted to the CFO scenario. */
export const NOV = {
  cogsBudget: { '5000': cr(30), '5100': cr(8), '5200': cr(8), '5300': cr(4) },
  cogsActual: { '5000': cr(26.5), '5100': cr(7.6), '5200': cr(7.9), '5300': cr(3.0) },
  opexBudget: {
    '6100': cr(15),
    '6200': cr(2),
    '6300': cr(3),
    '6400': cr(3.5),
    '6500': cr(3.5),
    '6600': cr(3),
    '6700': cr(3),
    '6800': cr(2),
  },
  opexActual: {
    '6100': cr(15.6),
    '6200': cr(2.8),
    '6300': cr(4.2),
    '6400': cr(4.5),
    '6500': cr(3.9),
    '6600': cr(3),
    '6700': cr(3),
    '6800': cr(2),
  },
} as const;

export const FY27 = [
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
  '2026-12',
  '2027-01',
  '2027-02',
  '2027-03',
] as const;
export const FY26 = [
  '2025-04',
  '2025-05',
  '2025-06',
  '2025-07',
  '2025-08',
  '2025-09',
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
] as const;

/** Monthly revenue totals in crore. */
export const REV_CR = {
  bud: [90, 94, 98, 96, 98, 104, 102, 100, 106, 102, 104, 106],
  act: [89, 95, 96, 95, 97, 104, 100, 92], // Apr-Nov; Nov is derived from sales lines and must equal 92
  fcOct: [100, 108, 104, 106, 106], // Nov-Mar as forecast at the October close
  py: [82, 86, 90, 88, 91, 96, 94, 92, 98, 95, 97, 106],
};

const FIRST = [
  'Kestrel',
  'Meridian',
  'Bluepeak',
  'Ironwood',
  'Solace',
  'Granite',
  'Aurora',
  'Vantage',
  'Helix',
  'Cobalt',
  'Ember',
  'Falcon',
  'Juniper',
  'Lumen',
  'Nimbus',
  'Orion',
  'Pinnacle',
  'Quarry',
  'Riverbend',
  'Summit',
  'Tidewater',
  'Union',
  'Vertex',
  'Westbrook',
  'Zenith',
  'Alder',
  'Birch',
  'Cedar',
  'Dune',
  'Elmgate',
];
const SECOND = [
  'Industries',
  'Works',
  'Engineering',
  'Systems',
  'Manufacturing',
  'Dynamics',
  'Power',
  'Machines',
];
const SUFFIX: Record<string, string> = { 'E-IN': 'Pvt Ltd', 'E-EU': 'GmbH', 'E-NA': 'Inc' };

export function buildCustomers(rng: Rng): Row[] {
  const plan: Array<[string, number, string[]]> = [
    ['E-IN', 14, ['India-North', 'India-South', 'India-West']],
    ['E-EU', 9, ['Europe']],
    ['E-NA', 7, ['North America']],
  ];
  const names = rng.shuffle(FIRST);
  let n = 0;
  const out: Row[] = [];
  for (const [entity, count, regions] of plan) {
    const code = entity.slice(2);
    for (let i = 1; i <= count; i++) {
      out.push({
        customer_id: `C-${code}-${String(i).padStart(2, '0')}`,
        name: `${names[n]} ${SECOND[n % SECOND.length]} ${SUFFIX[entity]}`,
        entity_id: entity,
        region: regions[(i - 1) % regions.length],
        segment: i === 1 ? 'Strategic' : i <= 3 ? 'Key' : 'Standard',
      });
      n++;
    }
  }
  return out;
}

export function buildPeriods(): Row[] {
  const all = [...FY26, ...FY27];
  return all.map((p) => {
    const fy26 = (FY26 as readonly string[]).includes(p);
    const idx = (fy26 ? FY26 : FY27).indexOf(p as never);
    return {
      period: p,
      fiscal_year: fy26 ? 'FY26' : 'FY27',
      fiscal_month: idx + 1,
      is_closed_actual: p <= '2026-11',
    };
  });
}

export const VERSIONS = [
  {
    version_id: 'BUD_FY27',
    name: 'Budget FY27',
    kind: 'BUDGET',
    fiscal_year: 'FY27',
    as_of_period: null,
  },
  {
    version_id: 'ACT_FY27',
    name: 'Actuals FY27 (to Nov 2026)',
    kind: 'ACTUAL',
    fiscal_year: 'FY27',
    as_of_period: '2026-11',
  },
  {
    version_id: 'FC_FY27_OCT',
    name: 'Forecast at October 2026 close',
    kind: 'FORECAST',
    fiscal_year: 'FY27',
    as_of_period: '2026-10',
  },
  {
    version_id: 'FC_FY27_NOV',
    name: 'Forecast at November 2026 close (latest)',
    kind: 'FORECAST',
    fiscal_year: 'FY27',
    as_of_period: '2026-11',
  },
  {
    version_id: 'ACT_FY26',
    name: 'Actuals FY26 (prior year)',
    kind: 'ACTUAL',
    fiscal_year: 'FY26',
    as_of_period: '2026-03',
  },
] as const;

export function buildFxRates(rng: Rng): Row[] {
  const out: Row[] = [];
  const base = { EUR: 92, USD: 84 } as const;
  const add = (version_id: string, period: string, currency: 'EUR' | 'USD', rate: number) =>
    out.push({ version_id, period, currency, rate_inr: Number(rate.toFixed(4)) });
  for (const p of FY27) for (const c of ['EUR', 'USD'] as const) add('BUD_FY27', p, c, base[c]);
  FY27.slice(0, 8).forEach((p, i) => {
    for (const c of ['EUR', 'USD'] as const)
      add('ACT_FY27', p, c, i === 7 ? base[c] : base[c] + rng.float(-1.2, 1.2)); // Nov = budget rate by design
  });
  FY27.slice(7).forEach((p) => {
    for (const c of ['EUR', 'USD'] as const) add('FC_FY27_OCT', p, c, base[c]);
  });
  FY27.slice(8).forEach((p) => {
    add('FC_FY27_NOV', p, 'EUR', 87.0);
    add('FC_FY27_NOV', p, 'USD', 79.5);
  });
  return out;
}

export const ACTIONS: Row[] = [
  {
    action_id: 'ACT-001',
    title: 'Recover delayed customer orders',
    driver_ref: 'ORDER_DELAY',
    owner_role: 'Regional Sales Director',
    potential_inr: cr(10),
    kind: 'TIMING_RECOVERY',
    timeline_days: 30,
    implementation_cost_inr: cr(0.25),
    overlaps_with: null,
    depends_on: 'Delivery capacity confirmation',
    risk: 'Delivery capacity and customer acceptance',
    confidence: 'MEDIUM',
  },
  {
    action_id: 'ACT-002',
    title: 'Rationalise discretionary expenditure',
    driver_ref: 'OPEX_DISCRETIONARY',
    owner_role: 'Finance Business Partner',
    potential_inr: cr(1.5),
    kind: 'RECURRING_SAVING',
    timeline_days: 90,
    implementation_cost_inr: cr(0.05),
    overlaps_with: null,
    depends_on: null,
    risk: 'Potential operational impact',
    confidence: 'HIGH',
  },
  {
    action_id: 'ACT-003',
    title: 'Optimise product mix toward higher-margin industrial equipment',
    driver_ref: 'MIX',
    owner_role: 'Commercial Head',
    potential_inr: cr(2),
    kind: 'RECURRING_MARGIN',
    timeline_days: 60,
    implementation_cost_inr: cr(0.1),
    overlaps_with: 'ACT-001',
    depends_on: 'Production capacity',
    risk: 'Demand elasticity and production capacity',
    confidence: 'MEDIUM',
  },
  {
    action_id: 'ACT-004',
    title: 'Review procurement contracts',
    driver_ref: 'PROCUREMENT',
    owner_role: 'Procurement Head',
    potential_inr: cr(0.8),
    kind: 'RECURRING_SAVING',
    timeline_days: 90,
    implementation_cost_inr: cr(0.1),
    overlaps_with: null,
    depends_on: null,
    risk: 'Supplier commitments and quality',
    confidence: 'MEDIUM',
  },
];
