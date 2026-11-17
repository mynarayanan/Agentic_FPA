import { createHash } from 'node:crypto';
import type { VarianceReport } from '@fpa/engine';
import type { Basis, Fact, FactSheet } from './types';

const trim = (s: string): string => s.replace(/0+$/, '').replace(/\.$/, '');

/** Display form of a fact. Money is shown in crore with two decimals, percentages with two decimals. */
export function formatFact(f: Fact, abs = false): string {
  const mag = (Math.abs(f.value) / (f.unit === 'inr' ? 10_000_000 : 1)).toFixed(2);
  const sign = !abs && f.value < 0 && Number(mag) !== 0 ? '-' : '';
  return f.unit === 'inr' ? `${sign}₹${mag} Cr` : `${sign}${mag}%`;
}

/** Digits found in text, ignoring ISO periods, fiscal-year tags and plain years. */
export function numbersIn(text: string): string[] {
  // Plain years are ignored only when they are clearly dates: not part of a longer number, not after a
  // rupee sign, and not followed by a unit. So "2099.90%" and "₹2026 Cr" are still treated as amounts.
  const t = text
    .replace(/\b\d{4}-\d{2}\b/g, ' ')
    .replace(/\bFY\d{2}\b/gi, ' ')
    .replace(
      /(?<![\d.,₹])\b(?:19|20)\d{2}\b(?![.,]?\d)(?!\s*(?:Cr\b|crores?\b|lakhs?\b|%|percent))/gi,
      ' ',
    );
  return [...t.matchAll(/(?<![A-Za-z0-9])\d[\d,]*(?:\.\d+)?/g)].map((m) =>
    (m[0] as string).replace(/,/g, ''),
  );
}

/** Every spelling of this fact's magnitude that a statement may legitimately contain, plus digits in its label (e.g. account ids). */
export function allowedNumbers(f: Fact): Set<string> {
  const fixed = (Math.abs(f.value) / (f.unit === 'inr' ? 10_000_000 : 1)).toFixed(2);
  const out = new Set<string>([fixed, trim(fixed) || '0']);
  if (fixed.endsWith('0')) out.add(fixed.slice(0, -1));
  for (const n of numbersIn(f.label)) out.add(n);
  return out;
}

const dir = (v: number): string => (v < 0 ? 'below budget' : v > 0 ? 'above budget' : 'on budget');

/** Turn an engine report into the closed list of facts the narrative may use. */
export function buildFactSheet(r: VarianceReport): FactSheet {
  const facts: Fact[] = [];
  const add = (
    key: string,
    label: string,
    value: number,
    unit: Fact['unit'],
    basis: Basis,
    calc_ref: string,
    extra: Partial<Fact> = {},
  ): void => {
    facts.push({ id: `F${facts.length + 1}`, key, label, value, unit, basis, calc_ref, ...extra });
  };
  const nm = r.names;
  const line = (
    key: string,
    label: string,
    t: {
      budget: number;
      actual: number;
      variance: number;
      variance_bps: number | null;
      favourable: boolean;
    },
    withPct: boolean,
  ): void => {
    add(`${key}.budget`, `${label} (budget)`, t.budget, 'inr', 'CONFIRMED', 'VAR-PNL-001');
    add(`${key}.actual`, `${label} (actual)`, t.actual, 'inr', 'CONFIRMED', 'VAR-PNL-001');
    add(`${key}.variance`, `${label} variance`, t.variance, 'inr', 'CALCULATED', 'VAR-PNL-001', {
      direction: dir(t.variance),
      favourable: t.favourable,
    });
    if (withPct && t.variance_bps !== null) {
      add(
        `${key}.variance_pct`,
        `${label} variance as % of budget`,
        t.variance_bps / 100,
        'pct',
        'CALCULATED',
        'VAR-PNL-001',
        { direction: dir(t.variance), favourable: t.favourable },
      );
    }
  };
  line('revenue', 'Revenue', r.pnl.revenue, true);
  line('other_costs', 'Other operating costs', r.pnl.otherOperatingCosts, false);
  line('opex', 'Operating expenses', r.pnl.opex, true);
  line('op', 'Operating profit', r.pnl.operatingProfit, false);

  r.accounts
    .filter((a) => a.type !== 'REVENUE' && a.variance !== 0) // revenue already has its own facts
    .slice(0, 5)
    .forEach((a, i) => {
      const name = a.name ?? nm?.accounts[a.account_id] ?? a.account_id;
      add(
        `account.${i + 1}`,
        `${name} (${a.account_id}) variance`,
        a.variance,
        'inr',
        'CALCULATED',
        'VAR-OPX-001',
        { direction: dir(a.variance), favourable: a.favourable },
      );
    });

  const b = r.revenue_bridge;
  if (b) {
    const eff = (v: number): string =>
      v < 0 ? 'reduced revenue' : v > 0 ? 'increased revenue' : 'no effect';
    for (const [k, label, v] of [
      ['total', 'Revenue bridge total', b.total],
      ['timing', 'Timing effect (delayed orders)', b.timing],
      ['price', 'Price effect (discounting)', b.price],
      ['volume', 'Volume effect', b.volume],
      ['mix', 'Product mix effect', b.mix],
    ] as const) {
      add(`bridge.${k}`, label, v, 'inr', 'CALCULATED', 'VAR-REV-002', {
        direction: eff(v),
        favourable: v >= 0,
      });
    }
    for (const bu of b.byBu) {
      const name = nm?.bus[bu.bu_id] ?? bu.bu_id;
      if (bu.volume !== 0)
        add(
          `bridge.bu.${bu.bu_id}.volume`,
          `${name} volume effect`,
          bu.volume,
          'inr',
          'CALCULATED',
          'VAR-REV-002',
          { direction: eff(bu.volume), favourable: bu.volume >= 0 },
        );
      if (bu.mix !== 0)
        add(
          `bridge.bu.${bu.bu_id}.mix`,
          `${name} product mix effect`,
          bu.mix,
          'inr',
          'CALCULATED',
          'VAR-REV-002',
          { direction: eff(bu.mix), favourable: bu.mix >= 0 },
        );
      if (bu.unit_change_bps !== null && Math.abs(bu.unit_change_bps) >= 50) {
        add(
          `bridge.bu.${bu.bu_id}.units`,
          `${name} delivered units versus budget`,
          bu.unit_change_bps / 100,
          'pct',
          'CALCULATED',
          'VAR-REV-002',
          {
            direction: bu.unit_change_bps < 0 ? 'fewer units' : 'more units',
            favourable: bu.unit_change_bps >= 0,
          },
        );
      }
    }
    b.cells
      .filter((c) => c.total !== 0)
      .sort(
        (x, y) =>
          Math.abs(y.total) - Math.abs(x.total) ||
          `${x.entity_id}${x.bu_id}`.localeCompare(`${y.entity_id}${y.bu_id}`),
      )
      .slice(0, 3)
      .forEach((c, i) => {
        add(
          `cell.${i + 1}`,
          `${nm?.entities[c.entity_id] ?? c.entity_id} / ${nm?.bus[c.bu_id] ?? c.bu_id} revenue variance`,
          c.total,
          'inr',
          'CALCULATED',
          'VAR-REV-002',
          { direction: dir(c.total), favourable: c.total >= 0 },
        );
      });
  }
  const hash = createHash('sha256')
    .update(JSON.stringify({ p: r.period, e: r.entity_id, facts }))
    .digest('hex');
  return {
    period: r.period,
    entity: r.entity_id,
    entity_name: r.entity_id ? (nm?.entities[r.entity_id] ?? r.entity_id) : null,
    facts,
    hash,
  };
}
