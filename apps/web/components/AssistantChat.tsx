'use client';

import { useState } from 'react';
import type { Fact, NarrativeResult } from '@fpa/narrative';
import { fmtFact } from '../lib/format';
import { api } from '../lib/token';
import { Badge } from './ui';
import { Statements, statusNote } from './NarrativePanel';

export const SUGGESTIONS = [
  'Why is operating profit below budget?',
  'What drove the revenue shortfall?',
  'Which costs are over budget?',
  'Is the opex overrun recurring?',
  'What happens to the full-year forecast?',
  'What should we do about it?',
];

interface Reply {
  question: string;
  topic: string;
  redirect: { screen: string; label: string; message: string } | null;
  answer: NarrativeResult | null;
  facts?: Fact[];
  calc_refs?: Array<{ id: string; version: string }>;
  error?: string;
}

export function Evidence({ answer, facts }: { answer: NarrativeResult; facts: Fact[] }) {
  const ids = [...new Set([answer.headline, ...answer.statements].flatMap((s) => s.fact_ids))];
  const used = ids.map((id) => facts.find((f) => f.id === id)).filter((f): f is Fact => Boolean(f));
  if (used.length === 0) return null;
  return (
    <details>
      <summary>Evidence ({used.length} figures)</summary>
      <table>
        <caption className="visually-hidden">Figures cited in this answer</caption>
        <thead>
          <tr>
            <th scope="col">Figure</th>
            <th scope="col" className="num">
              Value
            </th>
            <th scope="col">Basis</th>
            <th scope="col">Calculation</th>
          </tr>
        </thead>
        <tbody>
          {used.map((f) => (
            <tr key={f.id}>
              <th scope="row">{f.label}</th>
              <td className="num">{fmtFact(f)}</td>
              <td>{f.basis === 'CONFIRMED' ? 'Ledger fact' : 'Calculated'}</td>
              <td>{f.calc_ref}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function AssistantChat({ period, entity }: { period: string; entity?: string | null }) {
  const [q, setQ] = useState('');
  const [log, setLog] = useState<Reply[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setBusy(true);
    const r = await api<Reply>('/api/assistant', {
      method: 'POST',
      body: JSON.stringify({ question: text, period, ...(entity ? { entity } : {}) }),
    });
    setBusy(false);
    setLog((l) => [
      ...l,
      r.ok
        ? r.data
        : {
            question: text,
            topic: 'general',
            redirect: null,
            answer: null,
            error: (r.data as { error?: string }).error ?? 'The assistant could not answer.',
          },
    ]);
    setQ('');
  }

  return (
    <div>
      <p>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => void ask(s)}
          >
            {s}
          </button>
        ))}
      </p>
      <div className="chat" aria-live="polite">
        {log.map((m, i) => (
          <div key={i}>
            <div className="msg-q">{m.question}</div>
            <div className="msg-a">
              {m.error && (
                <p className="bad" role="alert">
                  {m.error}
                </p>
              )}
              {m.redirect && (
                <p>
                  {m.redirect.message} <a href={m.redirect.screen}>Open the {m.redirect.label}</a>.
                </p>
              )}
              {m.answer && (
                <>
                  <Badge tone={statusNote(m.answer).tone}>{statusNote(m.answer).label}</Badge>
                  <Statements narrative={m.answer} />
                  {m.facts && <Evidence answer={m.answer} facts={m.facts} />}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <label style={{ flex: 1, minWidth: 260 }}>
          Ask about {period}
          {entity ? ` (${entity})` : ''}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={300}
            placeholder="e.g. Why is operating profit below budget?"
          />
        </label>
        <button type="submit" disabled={busy || !q.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      <p className="provenance">
        Answers use only the calculated figures for this period. Questions about forecasts, actions
        and trends point to the screen that calculates them. AI wording needs the access token.
      </p>
    </div>
  );
}
