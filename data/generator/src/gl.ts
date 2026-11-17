import { allocate } from './alloc';
import {
  BU_IDS,
  COGS_ACCOUNTS,
  ENTITY_IDS,
  FY26,
  FY27,
  NOV,
  OPEX_ACCOUNTS,
  REV_CR,
  revenueAccountFor,
} from './dims';
import type { Row } from './dims';
import type { Rng } from './prng';
import { cellKey, cellRevenue, referenceBridge } from './sales';
import type { Line } from './sales';
import { cr, lakh, roundToLakh } from './units';

type Cells = Map<string, number>;
const CELLS: Array<[string, string]> = ENTITY_IDS.flatMap((e) =>
  BU_IDS.map((b) => [e, b] as [string, string]),
);
const ENTITY_W: Record<string, number> = { 'E-IN': 0.55, 'E-EU': 0.25, 'E-NA': 0.2 };
const BU_W: Record<string, number> = {
  'BU-IE': 0.25,
  'BU-AU': 0.2,
  'BU-CP': 0.15,
  'BU-SV': 0.2,
  'BU-EN': 0.2,
};
const SEASON = [0.96, 0.97, 0.98, 0.99, 0.99, 1.0, 1.0, 1.0, 1.01, 1.0, 1.0, 1.02];
const OVERRUN: Record<string, number[]> = {
  '6100': [0, 0.5, 1, 1.5, 2, 3, 3.5],
  '6200': [0, 3, 5, 8, 12, 18, 25],
  '6300': [0, 3, 5, 8, 12, 18, 25],
  '6400': [0, 2, 4, 6, 10, 15, 20],
  '6500': [0, 1, 2, 3, 4, 6, 8],
};
const FC_NOV_OPEX_MULT: Record<string, number> = {
  '6100': 1.04,
  '6200': 1.3,
  '6300': 1.3,
  '6400': 1.2,
  '6500': 1.08,
};
const COGS_SPLIT = [60, 16, 16, 8];

export interface GlResult {
  gl: Row[];
  bridge: Row[];
  overrides: Row[];
}

const sumCells = (c: Cells): number => [...c.values()].reduce((a, b) => a + b, 0);

export function buildGl(rng: Rng, lines: Line[]): GlResult {
  const budNov = cellRevenue(lines, 'bud');
  const actNov = cellRevenue(lines, 'act');
  const shares = CELLS.map(([e, b]) => budNov.get(cellKey(e, b)) as number);
  const spread = (total: number, noise: number): Cells => {
    const w = shares.map((s) => s * (1 + (noise ? rng.float(-noise, noise) : 0)));
    const a = allocate(total, w);
    return new Map(CELLS.map(([e, b], i) => [cellKey(e, b), a[i] as number]));
  };

  // ---------- revenue by cell, per version and period ----------
  const bud = new Map<string, Cells>();
  const act = new Map<string, Cells>();
  const py = new Map<string, Cells>();
  const fcOct = new Map<string, Cells>();
  const fcNov = new Map<string, Cells>();
  FY27.forEach((p, i) =>
    bud.set(p, p === '2026-11' ? budNov : spread(cr(REV_CR.bud[i] as number), 0)),
  );
  FY27.slice(0, 8).forEach((p, i) =>
    act.set(p, p === '2026-11' ? actNov : spread(cr(REV_CR.act[i] as number), 0.05)),
  );
  FY26.forEach((p, i) => py.set(p, spread(cr(REV_CR.py[i] as number), 0.05)));
  if (sumCells(actNov) !== cr(92)) throw new Error('Nov actual revenue must be 92 Cr');

  FY27.forEach((p, i) => {
    if (i < 7) fcOct.set(p, act.get(p) as Cells);
    else if (i === 7) fcOct.set(p, budNov);
    else fcOct.set(p, spread(cr(REV_CR.fcOct[i - 7] as number), 0));
  });

  // ---------- forecast bridge Dec-Mar (planted) ----------
  const bridge: Row[] = [];
  const delta = new Map<string, Cells>();
  const addBridge = (
    driver: string,
    sub: string,
    period: string,
    entity: string,
    bu: string,
    amount: number,
  ): void => {
    if (amount === 0) return;
    bridge.push({
      from_version_id: 'FC_FY27_OCT',
      to_version_id: 'FC_FY27_NOV',
      driver,
      sub_driver: sub,
      period,
      entity_id: entity,
      bu_id: bu,
      amount_inr: amount,
    });
    const m = delta.get(period) ?? new Map<string, number>();
    m.set(cellKey(entity, bu), (m.get(cellKey(entity, bu)) ?? 0) + amount);
    delta.set(period, m);
  };
  // November (actual-to-date) rows come straight from the sales reference bridge.
  const ref = referenceBridge(lines);
  for (const [k, c] of [...ref.byCell.entries()].sort()) {
    const [e, b] = k.split('|') as [string, string];
    addBridge('DEMAND', 'PRICE', '2026-11', e, b, c.price);
    addBridge('DEMAND', 'VOLUME', '2026-11', e, b, c.volume);
    addBridge('DEMAND', 'MIX', '2026-11', e, b, c.mix);
    addBridge('ORDER_DELAY', 'TIMING', '2026-11', e, b, c.timing);
  }
  const forward = FY27.slice(8);
  for (const p of forward) {
    const base = fcOct.get(p) as Cells;
    const dW = CELLS.map(
      ([e, b]) => (b === 'BU-IE' ? 0.6 : b === 'BU-AU' ? 0.4 : 0) * (ENTITY_W[e] as number) * 1000,
    );
    allocate(-cr(4.5), dW).forEach((amt, i) =>
      addBridge(
        'DEMAND',
        'OUTLOOK',
        p,
        (CELLS[i] as [string, string])[0],
        (CELLS[i] as [string, string])[1],
        amt,
      ),
    );
    const fW = CELLS.map(([e, b]) => (e === 'E-IN' ? 0 : (base.get(cellKey(e, b)) as number)));
    allocate(-cr(2.5), fW).forEach((amt, i) =>
      addBridge(
        'FX',
        'RATE',
        p,
        (CELLS[i] as [string, string])[0],
        (CELLS[i] as [string, string])[1],
        amt,
      ),
    );
  }
  // December: three strategic-customer orders slip to the next financial year; the three Nov-delayed orders land.
  addBridge('ORDER_DELAY', 'SLIPPAGE', '2026-12', 'E-IN', 'BU-IE', -cr(6));
  addBridge('ORDER_DELAY', 'SLIPPAGE', '2026-12', 'E-EU', 'BU-IE', -cr(5.5));
  addBridge('ORDER_DELAY', 'SLIPPAGE', '2026-12', 'E-NA', 'BU-IE', -cr(3.5));
  addBridge('ORDER_DELAY', 'TIMING', '2026-12', 'E-IN', 'BU-IE', lakh(40));
  addBridge('ORDER_DELAY', 'TIMING', '2026-12', 'E-EU', 'BU-IE', lakh(35));
  addBridge('ORDER_DELAY', 'TIMING', '2026-12', 'E-NA', 'BU-IE', lakh(25));

  FY27.forEach((p, i) => {
    if (i <= 7) fcNov.set(p, act.get(p) as Cells);
    else {
      const m = new Map(fcOct.get(p) as Cells);
      for (const [k, v] of delta.get(p) ?? []) m.set(k, (m.get(k) as number) + v);
      fcNov.set(p, m);
    }
  });

  const overrides: Row[] = [
    {
      version_id: 'FC_FY27_NOV',
      period: '2027-01',
      entity_id: 'E-IN',
      bu_id: 'BU-IE',
      driver: 'DEMAND',
      delta_inr: -lakh(40),
      role: 'Regional Sales Director',
      reason: 'Account team expects strategic customer to defer Q4 purchases',
    },
    {
      version_id: 'FC_FY27_NOV',
      period: '2027-01',
      entity_id: 'E-IN',
      bu_id: 'BU-AU',
      driver: 'DEMAND',
      delta_inr: -lakh(20),
      role: 'Business Unit Head',
      reason: 'Customer capital budget freeze',
    },
    {
      version_id: 'FC_FY27_NOV',
      period: '2027-02',
      entity_id: 'E-EU',
      bu_id: 'BU-AU',
      driver: 'DEMAND',
      delta_inr: -lakh(25),
      role: 'FP&A Planner',
      reason: 'Pipeline conversion lowered to historical average',
    },
    {
      version_id: 'FC_FY27_NOV',
      period: '2027-03',
      entity_id: 'E-NA',
      bu_id: 'BU-IE',
      driver: 'DEMAND',
      delta_inr: -lakh(30),
      role: 'FP&A Planner',
      reason: 'Manual haircut on uncommitted pipeline',
    },
  ];

  // ---------- costs ----------
  const cogsTotals = (
    kind: 'bud' | 'act' | 'fcOct' | 'fcNov' | 'py',
    i: number,
    rev: number,
  ): Record<string, number> => {
    if (i === 7 && kind === 'bud') return { ...NOV.cogsBudget };
    if (i === 7 && kind === 'act') return { ...NOV.cogsActual };
    const ratio = {
      bud: 0.5,
      fcOct: 0.5,
      fcNov: 0.495,
      act: 0.5 + rng.float(-0.012, 0.012),
      py: 0.51 + rng.float(-0.01, 0.01),
    }[kind];
    const total = Math.round(rev * ratio);
    const noise = kind === 'act' || kind === 'py';
    const parts = allocate(
      total,
      COGS_SPLIT.map((w) => w * (noise ? 1 + rng.float(-0.03, 0.03) : 1)),
    );
    return Object.fromEntries(COGS_ACCOUNTS.map((a, k) => [a, parts[k] as number]));
  };
  const opexTotals = (
    kind: 'bud' | 'act' | 'fcOct' | 'fcNov' | 'py',
    i: number,
  ): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const a of OPEX_ACCOUNTS) {
      const nb = (NOV.opexBudget as Record<string, number>)[a] as number;
      const budget = roundToLakh(nb * (SEASON[i] as number));
      if (kind === 'bud' || kind === 'fcOct') out[a] = budget;
      else if (kind === 'act')
        out[a] =
          i === 7
            ? ((NOV.opexActual as Record<string, number>)[a] as number)
            : roundToLakh(budget * (1 + (OVERRUN[a]?.[i] ?? 0) / 100 + rng.float(-0.005, 0.005)));
      else if (kind === 'fcNov') out[a] = roundToLakh(budget * (FC_NOV_OPEX_MULT[a] ?? 1));
      else out[a] = roundToLakh(budget * 0.9 * (1 + rng.float(-0.02, 0.02)));
    }
    return out;
  };
  const opexW = CELLS.map(([e, b]) => (ENTITY_W[e] as number) * (BU_W[b] as number) * 10000);

  const monthRows = (
    version: string,
    period: string,
    rev: Cells,
    cogs: Record<string, number>,
    opex: Record<string, number>,
  ): Row[] => {
    const rows: Row[] = [];
    const push = (e: string, b: string, account: string, amount: number): void => {
      rows.push({
        version_id: version,
        period,
        entity_id: e,
        bu_id: b,
        account_id: account,
        amount_inr: amount,
      });
    };
    for (const [e, b] of CELLS) push(e, b, revenueAccountFor(b), rev.get(cellKey(e, b)) as number);
    const revW = CELLS.map(([e, b]) => rev.get(cellKey(e, b)) as number);
    for (const a of COGS_ACCOUNTS)
      allocate(cogs[a] as number, revW).forEach((v, i) =>
        push((CELLS[i] as [string, string])[0], (CELLS[i] as [string, string])[1], a, v),
      );
    for (const a of OPEX_ACCOUNTS)
      allocate(opex[a] as number, opexW).forEach((v, i) =>
        push((CELLS[i] as [string, string])[0], (CELLS[i] as [string, string])[1], a, v),
      );
    return rows;
  };
  const relabel = (rows: Row[], version: string): Row[] =>
    rows.map((r) => ({ ...r, version_id: version }));

  const gl: Row[] = [];
  const budRows = new Map<string, Row[]>();
  const actRows = new Map<string, Row[]>();
  FY27.forEach((p, i) => {
    const rev = bud.get(p) as Cells;
    const rows = monthRows(
      'BUD_FY27',
      p,
      rev,
      cogsTotals('bud', i, sumCells(rev)),
      opexTotals('bud', i),
    );
    budRows.set(p, rows);
    gl.push(...rows);
  });
  FY27.slice(0, 8).forEach((p, i) => {
    const rev = act.get(p) as Cells;
    const rows = monthRows(
      'ACT_FY27',
      p,
      rev,
      cogsTotals('act', i, sumCells(rev)),
      opexTotals('act', i),
    );
    actRows.set(p, rows);
    gl.push(...rows);
  });
  FY27.forEach((p, i) => {
    if (i < 7) gl.push(...relabel(actRows.get(p) as Row[], 'FC_FY27_OCT'));
    else if (i === 7) gl.push(...relabel(budRows.get(p) as Row[], 'FC_FY27_OCT'));
    else {
      const rev = fcOct.get(p) as Cells;
      gl.push(
        ...monthRows(
          'FC_FY27_OCT',
          p,
          rev,
          cogsTotals('fcOct', i, sumCells(rev)),
          opexTotals('fcOct', i),
        ),
      );
    }
  });
  FY27.forEach((p, i) => {
    if (i <= 7) gl.push(...relabel(actRows.get(p) as Row[], 'FC_FY27_NOV'));
    else {
      const rev = fcNov.get(p) as Cells;
      gl.push(
        ...monthRows(
          'FC_FY27_NOV',
          p,
          rev,
          cogsTotals('fcNov', i, sumCells(rev)),
          opexTotals('fcNov', i),
        ),
      );
    }
  });
  FY26.forEach((p, i) => {
    const rev = py.get(p) as Cells;
    gl.push(
      ...monthRows('ACT_FY26', p, rev, cogsTotals('py', i, sumCells(rev)), opexTotals('py', i)),
    );
  });
  return { gl, bridge, overrides };
}
