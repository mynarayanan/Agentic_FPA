import type { VarianceData } from '../lib/loaders';
import { fmtBps, fmtCr, monthLabel, monthShort, tone } from '../lib/format';
import { PeriodEntityForm } from './Controls';
import { NarrativePanel } from './NarrativePanel';
import { Sparkline, Waterfall } from './charts';
import { Badge, Provenance, Section } from './ui';

const verdict = (v: number, kind: 'income' | 'cost'): string =>
  v === 0 ? 'On budget' : (kind === 'income') === v > 0 ? 'Favourable' : 'Adverse';

export function VarianceView({ data }: { data: VarianceData }) {
  const { report, controls } = data;
  const p = report.pnl;
  const nm = report.names;
  const b = report.revenue_bridge;
  const entityName = data.entity
    ? (nm?.entities[data.entity] ?? data.entity)
    : 'Group (all entities)';
  const rows = [
    { label: 'Revenue', t: p.revenue, kind: 'income' as const },
    { label: 'Other operating costs', t: p.otherOperatingCosts, kind: 'cost' as const },
    { label: 'Operating expenses', t: p.opex, kind: 'cost' as const },
    { label: 'Operating profit', t: p.operatingProfit, kind: 'income' as const },
  ];
  return (
    <>
      <h1>Variance investigation</h1>
      <p className="sub">
        {monthLabel(data.period)} · {entityName} · actual versus budget
      </p>
      <PeriodEntityForm
        controls={controls}
        period={data.period}
        entity={data.entity}
        action="/variance"
      />

      <Section title="Profit and loss">
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Budget, actual and variance by line</caption>
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col" className="num">
                  Budget
                </th>
                <th scope="col" className="num">
                  Actual
                </th>
                <th scope="col" className="num">
                  Variance
                </th>
                <th scope="col" className="num">
                  % of budget
                </th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, t, kind }) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="num">{fmtCr(t.budget)}</td>
                  <td className="num">{fmtCr(t.actual)}</td>
                  <td className={`num ${tone(t.variance, kind)}`}>
                    {fmtCr(t.variance, { signed: true })}
                  </td>
                  <td className="num">{fmtBps(t.variance_bps, { signed: true })}</td>
                  <td>
                    <Badge tone={tone(t.variance, kind)}>{verdict(t.variance, kind)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Explanation">
        <NarrativePanel initial={data.narrative} period={data.period} entity={data.entity} />
      </Section>

      {b ? (
        <Section title="Revenue bridge: budget to actual" id="bridge">
          <div className="grid grid-2">
            <div className="card">
              <Waterfall
                title={`Revenue bridge for ${monthLabel(data.period)}: budget ${fmtCr(b.budget)} to actual ${fmtCr(b.actual)}`}
                items={[
                  { label: 'Budget', value: b.budget, kind: 'total' },
                  { label: 'Timing', value: b.timing, kind: 'delta' },
                  { label: 'Price', value: b.price, kind: 'delta' },
                  { label: 'Volume', value: b.volume, kind: 'delta' },
                  { label: 'Mix', value: b.mix, kind: 'delta' },
                  { label: 'Actual', value: b.actual, kind: 'total' },
                ]}
              />
            </div>
            <div>
              <div className="table-wrap">
                <table>
                  <caption className="visually-hidden">Revenue bridge components</caption>
                  <thead>
                    <tr>
                      <th scope="col">Driver</th>
                      <th scope="col" className="num">
                        Effect
                      </th>
                      <th scope="col">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Timing</th>
                      <td className="num">{fmtCr(b.timing, { signed: true })}</td>
                      <td>Orders delivered after the period</td>
                    </tr>
                    <tr>
                      <th scope="row">Price</th>
                      <td className="num">{fmtCr(b.price, { signed: true })}</td>
                      <td>Discounting against budget price</td>
                    </tr>
                    <tr>
                      <th scope="row">Volume</th>
                      <td className="num">{fmtCr(b.volume, { signed: true })}</td>
                      <td>Fewer or more units at the budgeted mix</td>
                    </tr>
                    <tr>
                      <th scope="row">Mix</th>
                      <td className="num">{fmtCr(b.mix, { signed: true })}</td>
                      <td>Shift between products</td>
                    </tr>
                    <tr>
                      <th scope="row">Total</th>
                      <td className="num">{fmtCr(b.total, { signed: true })}</td>
                      <td>Equals actual minus budget exactly</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h3>Delivered units versus budget, by business unit</h3>
              <div className="table-wrap">
                <table>
                  <caption className="visually-hidden">
                    Delivered units versus budget and volume and mix effect, by business unit
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Business unit</th>
                      <th scope="col" className="num">
                        Units
                      </th>
                      <th scope="col" className="num">
                        Volume
                      </th>
                      <th scope="col" className="num">
                        Mix
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.byBu.map((x) => (
                      <tr key={x.bu_id}>
                        <th scope="row">{nm?.bus[x.bu_id] ?? x.bu_id}</th>
                        <td className="num">{fmtBps(x.unit_change_bps, { signed: true })}</td>
                        <td className="num">{fmtCr(x.volume, { signed: true })}</td>
                        <td className="num">{fmtCr(x.mix, { signed: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <h3>Where it happened: entity and business unit</h3>
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">
                Revenue variance by entity and business unit
              </caption>
              <thead>
                <tr>
                  <th scope="col">Entity</th>
                  <th scope="col">Business unit</th>
                  <th scope="col" className="num">
                    Timing
                  </th>
                  <th scope="col" className="num">
                    Price
                  </th>
                  <th scope="col" className="num">
                    Volume
                  </th>
                  <th scope="col" className="num">
                    Mix
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.cells
                  .filter((c) => c.total !== 0)
                  .map((c) => (
                    <tr key={`${c.entity_id}${c.bu_id}`}>
                      <th scope="row">{nm?.entities[c.entity_id] ?? c.entity_id}</th>
                      <td>{nm?.bus[c.bu_id] ?? c.bu_id}</td>
                      <td className="num">{fmtCr(c.timing, { signed: true })}</td>
                      <td className="num">{fmtCr(c.price, { signed: true })}</td>
                      <td className="num">{fmtCr(c.volume, { signed: true })}</td>
                      <td className="num">{fmtCr(c.mix, { signed: true })}</td>
                      <td className="num">{fmtCr(c.total, { signed: true })}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : (
        <p className="muted">
          Line-level sales detail is only available for the latest period, so the revenue bridge is
          not shown for {monthLabel(data.period)}.
        </p>
      )}

      <Section title="Cost accounts versus budget">
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Variance by cost account, largest first</caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col" className="num">
                  Budget
                </th>
                <th scope="col" className="num">
                  Actual
                </th>
                <th scope="col" className="num">
                  Variance
                </th>
                <th scope="col" className="num">
                  % of budget
                </th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {report.accounts
                .filter((a) => a.type !== 'REVENUE')
                .map((a) => (
                  <tr key={a.account_id}>
                    <th scope="row">
                      {a.name ?? a.account_id} <span className="muted">({a.account_id})</span>
                    </th>
                    <td className="num">{fmtCr(a.budget)}</td>
                    <td className="num">{fmtCr(a.actual)}</td>
                    <td className={`num ${tone(a.variance, 'cost')}`}>
                      {fmtCr(a.variance, { signed: true })}
                    </td>
                    <td className="num">{fmtBps(a.variance_bps, { signed: true })}</td>
                    <td>
                      <Badge tone={tone(a.variance, 'cost')}>{verdict(a.variance, 'cost')}</Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Is the overrun a one-off? Discretionary spend versus budget by month"
        id="trend"
      >
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">
              Monthly variance of discretionary accounts, April to the latest closed month
            </caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Trend</th>
                {data.trend[0]?.points.map((pt) => (
                  <th scope="col" className="num" key={pt.period}>
                    {monthShort(pt.period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.trend.map((a) => (
                <tr key={a.account_id}>
                  <th scope="row">{a.name}</th>
                  <td>
                    <Sparkline
                      values={a.points.map((x) => x.variance_bps ?? 0)}
                      label={`${a.name}: overrun as a percentage of budget, by month`}
                    />
                  </td>
                  {a.points.map((pt) => (
                    <td className={`num ${pt.variance_inr > 0 ? 'bad' : ''}`} key={pt.period}>
                      {fmtBps(pt.variance_bps, { signed: true })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="chart-note">
          Percent over budget each month (group). A rising line means the overrun is growing, not a
          one-off.
        </p>
      </Section>
      <Provenance refs={report.calc_refs} />
    </>
  );
}
