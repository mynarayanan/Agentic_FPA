'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getActor, getToken, setActor } from '../lib/token';

const ROLES = ['FINANCE_BUSINESS_PARTNER', 'FINANCE_MANAGER', 'CONTROLLER', 'CFO'] as const;
const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
  FINANCE_BUSINESS_PARTNER: 'Finance business partner',
  FINANCE_MANAGER: 'Finance manager',
  CONTROLLER: 'Controller',
  CFO: 'CFO',
};

type Result = { ok: boolean; text: string };

/** Approval actions for one recommendation. The server enforces every rule; this only offers the steps that make sense for the current status. */
export function ApprovalPanel({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [actor, setActorState] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('FINANCE_BUSINESS_PARTNER');
  const [why, setWhy] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  useEffect(() => setActorState(getActor()), []);

  if (status === 'AUTHORISED' || status === 'REJECTED')
    return <p className="muted">No further actions: this item is {status.toLowerCase()}.</p>;

  async function send(type: 'VALIDATE' | 'AUTHORISE' | 'REJECT' | 'MODIFY') {
    if (!getToken())
      return setRes({
        ok: false,
        text: 'Enter the access token (top right) to record an approval action.',
      });
    if (!actor.trim()) return setRes({ ok: false, text: 'Enter who you are (your user id).' });
    setActor(actor.trim());
    setBusy(true);
    const body: Record<string, unknown> = { type, actor_id: actor.trim(), actor_role: role };
    if (why.trim()) body.justification = why.trim();
    if (type === 'MODIFY') body.amount_inr = Math.round(Number(amount) * 10_000_000);
    const r = await api<{ error?: string; code?: string }>(`/api/recommendations/${id}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.ok) {
      setRes({ ok: true, text: `${type} recorded.` });
      setWhy('');
      router.refresh();
    } else
      setRes({
        ok: false,
        text: `${r.data.code ? `${r.data.code}: ` : ''}${r.data.error ?? 'The action failed.'}`,
      });
  }

  return (
    <div className="card">
      <p className="muted">Identity is asserted, not authenticated, in this proof of concept.</p>
      <div className="grid grid-4">
        <label>
          Your user id
          <input
            value={actor}
            onChange={(e) => setActorState(e.target.value)}
            placeholder="e.g. vera"
            autoComplete="off"
          />
        </label>
        <label>
          Acting as
          <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Justification (reject or modify)
          <input
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="at least 10 characters"
          />
        </label>
        <label>
          New amount, ₹ crore (modify)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 1.2"
          />
        </label>
      </div>
      <p>
        {status === 'PROPOSED' && (
          <button type="button" disabled={busy} onClick={() => send('VALIDATE')}>
            Validate (level 2)
          </button>
        )}{' '}
        {status === 'BUSINESS_VALIDATED' && (
          <button type="button" disabled={busy} onClick={() => send('AUTHORISE')}>
            Authorise (level 3)
          </button>
        )}{' '}
        <button type="button" className="secondary" disabled={busy} onClick={() => send('MODIFY')}>
          Modify amount
        </button>{' '}
        <button type="button" className="danger" disabled={busy} onClick={() => send('REJECT')}>
          Reject
        </button>
      </p>
      {res && (
        <p className={res.ok ? 'good' : 'bad'} role={res.ok ? 'status' : 'alert'}>
          {res.text}
        </p>
      )}
    </div>
  );
}

export function GenerateButton({ period }: { period: string }) {
  const router = useRouter();
  const [who, setWho] = useState('');
  const [msg, setMsg] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setWho(getActor()), []);
  async function go() {
    if (!getToken())
      return setMsg({ ok: false, text: 'Enter the access token (top right) first.' });
    if (!who.trim()) return setMsg({ ok: false, text: 'Enter your user id.' });
    setActor(who.trim());
    setBusy(true);
    const r = await api<{ created?: string[]; existing?: string[]; error?: string }>(
      '/api/recommendations/generate',
      { method: 'POST', body: JSON.stringify({ period, requested_by: who.trim() }) },
    );
    setBusy(false);
    if (r.ok) {
      setMsg({
        ok: true,
        text: `${r.data.created?.length ?? 0} created, ${r.data.existing?.length ?? 0} already existed.`,
      });
      router.refresh();
    } else setMsg({ ok: false, text: r.data.error ?? 'The request failed.' });
  }
  return (
    <div className="card">
      <p>
        Ask the AI agent to assess the action library against the {period} variance and file
        recommendations. Whoever runs this cannot later validate or authorise them.
      </p>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <label>
          Your user id
          <input
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="e.g. rita"
            autoComplete="off"
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : 'Generate recommendations'}
        </button>
      </form>
      {msg && (
        <p className={msg.ok ? 'good' : 'bad'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
