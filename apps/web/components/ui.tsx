import type { ReactNode } from 'react';
import type { Tone } from '../lib/format';

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone | 'info';
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** A headline number with its comparison. Tone is also stated in words so colour is never the only signal. */
export function Kpi({
  label,
  value,
  sub,
  tone = 'neutral',
  verdict,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  verdict?: string;
}) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {verdict && <Badge tone={tone}>{verdict}</Badge>}
    </div>
  );
}

export function Section({
  title,
  id,
  children,
  aside,
}: {
  title: string;
  id?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Notice({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warn' | 'error';
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'note'}>
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

export function SetupNotice() {
  return (
    <Notice kind="warn" title="The database is not connected">
      <p>
        Set <code>DATABASE_URL</code> for this deployment, then run <code>pnpm db:migrate</code> and{' '}
        <code>pnpm db:load</code>. See <code>docs/runbook-neon.md</code>.
      </p>
    </Notice>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <Notice kind="error" title="Something went wrong">
      {message}
    </Notice>
  );
}

export function Provenance({ refs }: { refs: Array<{ id: string; version: string }> }) {
  return (
    <p className="provenance">
      Calculated by the deterministic engine: {refs.map((r) => `${r.id} v${r.version}`).join(', ')}.
      See <code>docs/calc-registry.md</code>.
    </p>
  );
}
