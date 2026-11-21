import type { ActionsData } from '../lib/loaders';
import { STATUS_LABEL, fmtBps, fmtCr, monthLabel } from '../lib/format';
import { ApprovalPanel, GenerateButton } from './ApprovalPanel';
import { Badge, Kpi, Notice, Provenance, Section } from './ui';

interface Assessment {
  gross_inr: number;
  revenue_impact_inr: number;
  profit_gross_inr: number;
  overlap_haircut_inr: number;
  confidence: string;
  risk_adjusted_profit_inr: number;
  phasing_bps: number;
  in_year_profit_inr: number;
  implementation_cost_inr: number;
  net_in_year_profit_inr: number;
  incremental: boolean;
  notes: string[];
}

const tone = (s: string) =>
  (s === 'AUTHORISED' ? 'good' : s === 'REJECTED' ? 'bad' : 'info') as 'good' | 'bad' | 'info';

export function ActionsView({ data }: { data: ActionsData }) {
  const t = data.totals;
  const coverage =
    data.gap_inr > 0 ? Math.round((t.net_in_year_profit_inr * 10_000) / data.gap_inr) : null;
  return (
    <>
      <h1>Corrective actions</h1>
      <p className="sub">{monthLabel(data.period)} · assessed by the engine, approved by people</p>

      {!data.audit.ok && (
        <Notice kind="error" title="The approval audit log failed its integrity check">
          {data.audit.problems.map((p) => `${p.recommendation_id}: ${p.problem}`).join('; ')}
        </Notice>
      )}

      {data.recommendations.length === 0 ? (
        <>
          <Notice title="No recommendations yet">
            The AI agent has not assessed the action library for this period.
          </Notice>
          <GenerateButton period={data.period} />
        </>
      ) : (
        <>
          <div className="grid grid-4">
            <Kpi
              label="Headline potential"
              value={fmtCr(t.headline_inr)}
              sub="Sum of the proposals, as submitted. Mixes revenue and profit."
            />
            <Kpi
              label="Of which recovered revenue"
              value={fmtCr(t.revenue_recovery_inr)}
              sub="Timing, not new demand"
            />
            <Kpi
              label="Net in-year profit"
              value={fmtCr(t.net_in_year_profit_inr)}
              sub="After overlap, confidence, phasing and cost"
              tone="good"
            />
            <Kpi
              label="Share of the profit gap closed"
              value={coverage === null ? 'n/a' : fmtBps(coverage)}
              sub={`Gap ${fmtCr(data.gap_inr)}`}
            />
          </div>

          <Section title="Recommendations">
            <div className="table-wrap">
              <table>
                <caption className="visually-hidden">
                  Recommendations with assessed impact and approval status
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Recommendation</th>
                    <th scope="col" className="num">
                      Proposed
                    </th>
                    <th scope="col" className="num">
                      Risk-adjusted profit
                    </th>
                    <th scope="col" className="num">
                      Net in-year
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">Waiting for</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recommendations.map(({ rec }) => {
                    const a = rec.assessment as Assessment;
                    return (
                      <tr key={rec.id}>
                        <th scope="row">
                          {rec.id}: {rec.title}
                          <div className="muted">Owner: {rec.owner_role}</div>
                        </th>
                        <td className="num">{fmtCr(rec.amount_inr)}</td>
                        <td className="num">{fmtCr(a.risk_adjusted_profit_inr)}</td>
                        <td className="num">{fmtCr(a.net_in_year_profit_inr)}</td>
                        <td>
                          <Badge tone={tone(rec.status)}>
                            {STATUS_LABEL[rec.status] ?? rec.status}
                          </Badge>
                          {rec.revision > 1 && <div className="muted">revision {rec.revision}</div>}
                        </td>
                        <td>{rec.awaiting}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="chart-note">
              These are proposed opportunities, not guaranteed savings. Nothing here changes the
              forecast or any financial system.
            </p>
          </Section>

          <Section title="Detail, evidence and approval">
            {data.recommendations.map(({ rec, events, chainOk }) => {
              const a = rec.assessment as Assessment;
              return (
                <details key={rec.id} className="card" style={{ marginBottom: 12 }}>
                  <summary>
                    <strong>{rec.id}</strong> {rec.title}{' '}
                    <Badge tone={tone(rec.status)}>{STATUS_LABEL[rec.status] ?? rec.status}</Badge>
                  </summary>
                  <div className="grid grid-2">
                    <div>
                      <h3>How the proposed amount becomes in-year profit</h3>
                      <ol className="steps">
                        <li>
                          Proposed: {fmtCr(a.gross_inr)}
                          {a.revenue_impact_inr > 0 ? ' of recovered revenue' : ''}
                        </li>
                        <li>As profit: {fmtCr(a.profit_gross_inr)}</li>
                        <li>
                          After overlap with other actions:{' '}
                          {fmtCr(a.profit_gross_inr - a.overlap_haircut_inr)}
                        </li>
                        <li>
                          At {a.confidence.toLowerCase()} confidence:{' '}
                          {fmtCr(a.risk_adjusted_profit_inr)}
                        </li>
                        <li>
                          Phased into this year ({fmtBps(a.phasing_bps)}):{' '}
                          {fmtCr(a.in_year_profit_inr)}
                        </li>
                        <li>
                          Less implementation cost {fmtCr(a.implementation_cost_inr)}:{' '}
                          <strong>{fmtCr(a.net_in_year_profit_inr)}</strong>
                        </li>
                      </ol>
                      <ul>
                        {a.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3>Evidence from the data</h3>
                      <ul>
                        {rec.evidence.map((e) => (
                          <li key={e.label}>
                            {e.label}:{' '}
                            {[
                              e.value_inr !== null ? fmtCr(e.value_inr) : null,
                              e.count !== null ? `${e.count} items` : null,
                              e.bps !== null ? `${e.bps} bps` : null,
                            ]
                              .filter(Boolean)
                              .join(', ')}{' '}
                            <span className="muted">({e.source})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <h3>
                    History{' '}
                    {chainOk ? (
                      <Badge tone="good">chain intact</Badge>
                    ) : (
                      <Badge tone="bad">chain broken</Badge>
                    )}
                  </h3>
                  <div className="table-wrap">
                    <table>
                      <caption className="visually-hidden">Approval history for {rec.id}</caption>
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">When</th>
                          <th scope="col">Event</th>
                          <th scope="col">Who</th>
                          <th scope="col">Result</th>
                          <th scope="col">Justification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((e) => (
                          <tr key={e.n}>
                            <td>{e.n}</td>
                            <td>{e.at.replace('T', ' ').slice(0, 19)}</td>
                            <td>{e.type}</td>
                            <td>
                              {e.actor_id} <span className="muted">({e.actor_role})</span>
                            </td>
                            <td>
                              {e.from_state ? `${e.from_state} → ` : ''}
                              {e.to_state}
                            </td>
                            <td>{e.justification ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <h3>Take action</h3>
                  <ApprovalPanel id={rec.id} status={rec.status} />
                </details>
              );
            })}
          </Section>
          <Section title="Generate again">
            <GenerateButton period={data.period} />
          </Section>
        </>
      )}
      <Provenance refs={[{ id: 'ACT-IMP-001', version: '1.0.0' }]} />
    </>
  );
}
