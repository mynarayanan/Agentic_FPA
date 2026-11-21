export const CRORE = 10_000_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Money in crore with two decimals: ₹8.00 Cr, -₹8.00 Cr. Matches the narrative layer's formatting exactly. */
export function fmtCr(rupees: number, opts: { signed?: boolean; abs?: boolean } = {}): string {
  const mag = (Math.abs(rupees) / CRORE).toFixed(2);
  const zero = Number(mag) === 0;
  const sign = opts.abs || zero ? '' : rupees < 0 ? '-' : opts.signed ? '+' : '';
  return `${sign}₹${mag} Cr`;
}

/** Basis points as a percentage with two decimals. */
export function fmtBps(bps: number | null, opts: { signed?: boolean; abs?: boolean } = {}): string {
  if (bps === null) return 'n/a';
  const mag = (Math.abs(bps) / 100).toFixed(2);
  const zero = Number(mag) === 0;
  const sign = opts.abs || zero ? '' : bps < 0 ? '-' : opts.signed ? '+' : '';
  return `${sign}${mag}%`;
}

/** A fact from the narrative layer (inr = rupees, pct = percent). */
export function fmtFact(f: { value: number; unit: 'inr' | 'pct' }, abs = false): string {
  if (f.unit === 'inr') return fmtCr(f.value, { abs });
  const mag = Math.abs(f.value).toFixed(2);
  return `${!abs && f.value < 0 && Number(mag) !== 0 ? '-' : ''}${mag}%`;
}

/** Plain crore number for chart labels, no symbol: -3.97 */
export function crNumber(rupees: number, decimals = 2): string {
  return (rupees / CRORE).toFixed(decimals);
}

export function monthLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : period;
}
export function monthShort(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? (MONTHS[Number(m[2]) - 1] ?? period) : period;
}

export type Tone = 'good' | 'bad' | 'neutral';
/** Revenue/profit above plan is good; cost above plan is bad. */
export function tone(variance: number, kind: 'income' | 'cost'): Tone {
  if (variance === 0) return 'neutral';
  return (kind === 'income') === variance > 0 ? 'good' : 'bad';
}

export const STATUS_LABEL: Record<string, string> = {
  PROPOSED: 'Proposed (level 1)',
  BUSINESS_VALIDATED: 'Validated (level 2)',
  AUTHORISED: 'Authorised (level 3)',
  REJECTED: 'Rejected',
};
