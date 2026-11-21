'use client';

import { useState } from 'react';
import type { NarrativeResult } from '@fpa/narrative';
import { api, getToken } from '../lib/token';
import { Badge } from './ui';

const KIND_LABEL = {
  CONFIRMED: 'Ledger fact',
  CALCULATED: 'Calculated',
  HYPOTHESIS: 'Hypothesis: needs validation',
} as const;

export function statusNote(n: Pick<NarrativeResult, 'status' | 'fallback_reason'>): {
  label: string;
  tone: 'info' | 'neutral' | 'bad';
} {
  if (n.status === 'OK' || n.status === 'RETRIED')
    return { label: 'AI-written, every number validated', tone: 'info' };
  if (n.status === 'FALLBACK')
    return {
      label:
        n.fallback_reason === 'LLM_ERROR'
          ? 'AI unavailable: rule-based summary shown'
          : 'AI text rejected by the validator: rule-based summary shown',
      tone: 'bad',
    };
  return { label: 'Rule-based summary (no AI)', tone: 'neutral' };
}

export function Statements({ narrative }: { narrative: NarrativeResult }) {
  const all = [narrative.headline, ...narrative.statements];
  return (
    <div>
      {all.map((s, i) => (
        <div className="statement" key={i}>
          <Badge
            tone={s.kind === 'HYPOTHESIS' ? 'bad' : s.kind === 'CONFIRMED' ? 'neutral' : 'info'}
          >
            {KIND_LABEL[s.kind]}
          </Badge>
          <span style={i === 0 ? { fontWeight: 600 } : undefined}>{s.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Shows the narrative rendered on the server. A user with the access token can ask the model to rewrite it; the result is validated before it is shown. */
export function NarrativePanel({
  initial,
  period,
  entity,
}: {
  initial: NarrativeResult;
  period: string;
  entity?: string | null;
}) {
  const [n, setN] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const note = statusNote(n);

  async function rewrite() {
    if (!getToken()) {
      setMsg('Enter the access token (top right) to use the AI writer.');
      return;
    }
    setBusy(true);
    setMsg('');
    const q = new URLSearchParams({ period, ...(entity ? { entity } : {}) });
    const r = await api<{ narrative?: NarrativeResult; error?: string }>(`/api/narrative?${q}`);
    setBusy(false);
    if (!r.ok || !r.data.narrative) return setMsg(r.data.error ?? 'The request failed.');
    setN(r.data.narrative);
    if (r.data.narrative.status === 'TEMPLATE')
      setMsg(
        'The server returned the rule-based summary (no model key, or the token was not accepted).',
      );
  }

  return (
    <div className="card">
      <div className="section-head">
        <Badge tone={note.tone}>{note.label}</Badge>
        <button type="button" className="secondary" onClick={rewrite} disabled={busy}>
          {busy ? 'Writing…' : 'Rewrite with AI'}
        </button>
      </div>
      <Statements narrative={n} />
      {msg && (
        <p className="chart-note" role="status">
          {msg}
        </p>
      )}
      <p className="provenance">
        Every figure comes from the calculation engine (
        {[...new Set([n.headline, ...n.statements].flatMap((s) => s.calc_refs))].join(', ') ||
          'no figures cited'}
        ). The AI chooses words, never numbers.
      </p>
    </div>
  );
}
