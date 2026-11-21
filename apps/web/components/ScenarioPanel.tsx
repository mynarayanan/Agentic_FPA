'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScenarioOutput } from '@fpa/db';
import { fmtCr } from '../lib/format';
import { api } from '../lib/token';

type Shocks = { volume: number; price: number; material_cost: number; opex: number };
export { SCENARIO_DEFAULTS } from '../lib/scenario-defaults';
import { SCENARIO_DEFAULTS } from '../lib/scenario-defaults';
const CONTROLS: Array<{ key: keyof Shocks; label: string; min: number; max: number }> = [
  { key: 'volume', label: 'Sales volume', min: -20, max: 10 },
  { key: 'price', label: 'Selling price', min: -10, max: 10 },
  { key: 'material_cost', label: 'Raw material cost', min: -10, max: 20 },
  { key: 'opex', label: 'Operating expenses', min: -10, max: 10 },
];

export function ScenarioTable({ out }: { out: ScenarioOutput }) {
  const r = out.result;
  const rows: Array<[string, number, number, number, number, number, 'income' | 'cost']> = [
    [
      'Revenue',
      r.remaining_before.revenue,
      r.remaining_after.revenue,
      r.full_year_before.revenue,
      r.full_year_after.revenue,
      r.delta.revenue,
      'income',
    ],
    [
      'Cost of sales',
      r.remaining_before.cost_of_sales,
      r.remaining_after.cost_of_sales,
      r.full_year_before.cost_of_sales,
      r.full_year_after.cost_of_sales,
      r.delta.cost_of_sales,
      'cost',
    ],
    [
      'Operating expenses',
      r.remaining_before.opex,
      r.remaining_after.opex,
      r.full_year_before.opex,
      r.full_year_after.opex,
      r.delta.opex,
      'cost',
    ],
    [
      'Operating profit (EBITDA proxy)',
      r.remaining_before.operating_profit,
      r.remaining_after.operating_profit,
      r.full_year_before.operating_profit,
      r.full_year_after.operating_profit,
      r.delta.operating_profit,
      'income',
    ],
  ];
  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">
          Scenario result: remaining months and full year, before and after the shocks
        </caption>
        <thead>
          <tr>
            <th scope="col">₹ crore</th>
            <th scope="col" className="num">
              Remaining: base
            </th>
            <th scope="col" className="num">
              Remaining: scenario
            </th>
            <th scope="col" className="num">
              Full year: base
            </th>
            <th scope="col" className="num">
              Full year: scenario
            </th>
            <th scope="col" className="num">
              Full-year change
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, rb, ra, fb, fa, d, kind]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className="num">{fmtCr(rb)}</td>
              <td className="num">{fmtCr(ra)}</td>
              <td className="num">{fmtCr(fb)}</td>
              <td className="num">{fmtCr(fa)}</td>
              <td
                className={`num ${d === 0 ? 'muted' : (kind === 'income') === d > 0 ? 'good' : 'bad'}`}
              >
                {fmtCr(d, { signed: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What-if sliders. Every figure comes from the engine via /api/scenario; this component does no arithmetic. */
export function ScenarioPanel({
  initial,
  defaults = SCENARIO_DEFAULTS,
}: {
  initial: ScenarioOutput;
  defaults?: Shocks;
}) {
  const [s, setS] = useState<Shocks>(defaults);
  const [out, setOut] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      const q = new URLSearchParams(Object.entries(s).map(([k, v]) => [k, String(v)]));
      try {
        const r = await api<ScenarioOutput & { error?: string }>(`/api/scenario?${q}`, {
          signal: ctrl.signal,
        });
        if (r.ok) {
          setOut(r.data);
          setErr('');
        } else setErr(r.data.error ?? 'The scenario could not be calculated.');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErr('The scenario could not be calculated.');
      }
      setBusy(false);
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [s]);

  return (
    <div className="card">
      <p className="sub">
        Shocks apply to the months still to come in the latest forecast ({out.closed_through} is the
        last closed month).
      </p>
      {CONTROLS.map((c) => (
        <div className="slider" key={c.key}>
          <label htmlFor={`sc-${c.key}`}>{c.label}</label>
          <input
            id={`sc-${c.key}`}
            type="range"
            min={c.min}
            max={c.max}
            step={1}
            value={s[c.key]}
            onChange={(e) => setS({ ...s, [c.key]: Number(e.target.value) })}
          />
          <output htmlFor={`sc-${c.key}`}>
            {s[c.key] > 0 ? '+' : ''}
            {s[c.key]}%
          </output>
        </div>
      ))}
      <p>
        <button
          type="button"
          className="secondary"
          onClick={() => setS({ volume: 0, price: 0, material_cost: 0, opex: 0 })}
        >
          No change
        </button>{' '}
        <button type="button" className="secondary" onClick={() => setS(defaults)}>
          Reset
        </button>{' '}
        {busy && <span className="muted">Calculating…</span>}
      </p>
      {err && (
        <p className="bad" role="alert">
          {err}
        </p>
      )}
      <ScenarioTable out={out} />
      <details>
        <summary>Assumptions</summary>
        <ul>
          {out.result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
      <p className="provenance">Calculated by SCN-WHI-001. A modelling tool, not a forecast.</p>
    </div>
  );
}
