'use client';

import { useEffect, useState } from 'react';
import type { Fact, NarrativeResult } from '@fpa/narrative';

const periods = [
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
];

const entities = [
  { id: '', name: 'All entities' },
  { id: 'E-IN', name: 'India Manufacturing' },
  { id: 'E-EU', name: 'Europe Manufacturing' },
  { id: 'E-NA', name: 'North America Manufacturing' },
];

interface NarrativeResponse {
  period: string;
  entity_id: string | null;
  narrative: NarrativeResult;
  facts: Fact[];
  calc_refs: Array<{ id: string; version: string }>;
}

function formatFact(fact: Fact): string {
  if (fact.unit === 'pct') return `${fact.value.toFixed(2)}%`;
  const crore = Math.abs(fact.value) / 10_000_000;
  const sign = fact.value < 0 && crore !== 0 ? '-' : '';
  return `${sign}₹${crore.toFixed(2)} Cr`;
}

function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (year === undefined || month === undefined) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function NarrativePanel() {
  const [period, setPeriod] = useState('2026-11');
  const [entity, setEntity] = useState('E-IN');
  const [result, setResult] = useState<NarrativeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ period });
    if (entity) params.set('entity', entity);

    setLoading(true);
    setError(null);
    setResult(null);

    void (async () => {
      try {
        const response = await fetch(`/api/narrative?${params}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as NarrativeResponse | { error?: string };
        if (!response.ok) {
          throw new Error(
            'error' in body && body.error
              ? body.error
              : `Narrative request failed (${response.status})`,
          );
        }
        setResult(body as NarrativeResponse);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Narrative request failed');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [period, entity, reloadToken]);

  return (
    <section aria-labelledby="narrative-title">
      <h2 id="narrative-title">Financial narrative</h2>
      <div>
        <label>
          Period{' '}
          <select
            aria-label="Period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            {periods.map((option) => (
              <option key={option} value={option}>
                {periodLabel(option)}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Entity{' '}
          <select
            aria-label="Entity"
            value={entity}
            onChange={(event) => setEntity(event.target.value)}
          >
            {entities.map((option) => (
              <option key={option.id || 'all'} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p role="status">Loading narrative…</p>}
      {error && (
        <p role="alert">
          Could not load the narrative: {error}. Check that the database is configured and try
          again.
          <button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            Retry
          </button>
        </p>
      )}

      {result && (
        <div data-testid="narrative">
          <p>
            {periodLabel(result.period)}
            {result.entity_id
              ? ` · ${entities.find((option) => option.id === result.entity_id)?.name ?? result.entity_id}`
              : ' · All entities'}
          </p>
          <p>
            Narrative status: <strong>{result.narrative.status}</strong>
            {result.narrative.model ? ` · ${result.narrative.model}` : ''}
          </p>
          <h3>{result.narrative.headline.text}</h3>
          <ul>
            {result.narrative.statements.map((statement, index) => (
              <li key={`${statement.text}-${index}`}>
                <p>{statement.text}</p>
                <small>
                  {statement.kind}
                  {statement.calc_refs.length
                    ? ` · Calculations: ${statement.calc_refs.join(', ')}`
                    : ''}
                </small>
              </li>
            ))}
          </ul>

          <h3>Supporting facts</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">Fact</th>
                <th scope="col">Value</th>
                <th scope="col">Basis</th>
                <th scope="col">Calculation</th>
              </tr>
            </thead>
            <tbody>
              {result.facts.map((fact) => (
                <tr key={fact.id}>
                  <th scope="row">{fact.label}</th>
                  <td>{formatFact(fact)}</td>
                  <td>{fact.basis}</td>
                  <td>{fact.calc_ref}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            Calculation references:{' '}
            {result.calc_refs
              .map((reference) => `${reference.id} (${reference.version})`)
              .join(', ')}
          </p>
        </div>
      )}
    </section>
  );
}
