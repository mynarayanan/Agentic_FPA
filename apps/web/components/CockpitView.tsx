import type { CockpitData } from '../lib/loaders';
import { STATUS_LABEL, fmtBps, fmtCr, monthLabel, tone } from '../lib/format';
import { NarrativePanel } from './NarrativePanel';
import { Badge, Kpi, Provenance, Section } from './ui';

const verdict = (v: number, kind: 'income' | 'cost'): string =>
  v === 0 ? 'On budget' : (kind === 'income') === v > 0 ? 'Favourable' : 'Adverse';

export function CockpitView({ data }: { data: CockpitData }) {
  const { report, forecast, alerts } = data;
  const p = report.pnl;
  const f = forecast.comparison;
  return (
    <>
      <h1>Finance cockpit</h1>
      <p className="sub">
        {monthLabel(data.period)}, group · actual versus budget · FY27 (April 2026 to March 2027)
      </p>

      <div className="grid grid-4">
        <Kpi
          label="Revenue"
          value={fmtCr(p.revenue.actual)}
          sub={`Budget ${fmtCr(p.revenue.budget)} · ${fmtCr(p.revenue.variance, { signed: true })} (${fmtBps(p.revenue.variance_bps, { signed: true })})`}
          tone={tone(p.revenue.variance, 'income')}
          verdict={verdict(p.revenue.variance, 'income')}
        />
        <Kpi
          label="Operating expenses"
          value={fmtCr(p.opex.actual)}
          sub={`Budget ${fmtCr(p.opex.budget)} · ${fmtCr(p.opex.variance, { signed: true })} (${fmtBps(p.opex.variance_bps, { signed: true })})`}
          tone={tone(p.opex.variance, 'cost')}
          verdict={verdict(p.opex.variance, 'cost')}
        />
        <Kpi
          label="Operating profit"
          value={fmtCr(p.operatingProfit.actual)}
          sub={`Budget ${fmtCr(p.operatingProfit.budget)} · ${fmtCr(p.operatingProfit.variance, { signed: true })}`}
          tone={tone(p.operatingProfit.variance, 'income')}
          verdict={verdict(p.operatingProfit.variance, 'income')}
        />
        <Kpi
          label="Full-year revenue forecast"
          value={fmtCr(f.full_year.latest)}
          sub={`Previous ${fmtCr(f.full_year.previous)} · ${fmtCr(f.change_vs_previous, { signed: true })} (${fmtBps(f.change_vs_previous_bps, { signed: true })})`}
          tone={tone(f.change_vs_previous, 'income')}
          verdict={verdict(f.change_vs_previous, 'income')}
        />
      </div>

      <Section title="Needs attention">
        {alerts.length === 0 ? (
          <p className="muted">Nothing needs attention.</p>
        ) : (
          <ul className="alerts">
            {alerts.map((a) => (
              <li key={a.text}>
                <Badge
                  tone={a.level === 'critical' ? 'bad' : a.level === 'warning' ? 'bad' : 'info'}
                >
                  {a.level === 'critical' ? 'Critical' : a.level === 'warning' ? 'Warning' : 'Info'}
                </Badge>
                <a href={a.href}>{a.text}</a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What happened">
        <NarrativePanel initial={data.narrative} period={data.period} />
      </Section>

      <Section title="Pending decisions" aside={<a href="/actions">Open the Actions screen</a>}>
        {data.recommendations.length === 0 ? (
          <p className="muted">
            No recommendations have been filed for {monthLabel(data.period)} yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">
                Recommendations and their approval status
              </caption>
              <thead>
                <tr>
                  <th scope="col">Recommendation</th>
                  <th scope="col">Owner</th>
                  <th scope="col" className="num">
                    Net in-year profit
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recommendations.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      {r.id}: {r.title}
                    </th>
                    <td>{r.owner_role}</td>
                    <td className="num">
                      {fmtCr(
                        (r.assessment as { net_in_year_profit_inr: number }).net_in_year_profit_inr,
                      )}
                    </td>
                    <td>
                      <Badge
                        tone={
                          r.status === 'AUTHORISED'
                            ? 'good'
                            : r.status === 'REJECTED'
                              ? 'bad'
                              : 'info'
                        }
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Provenance refs={[...report.calc_refs, ...forecast.calc_refs]} />
    </>
  );
}
