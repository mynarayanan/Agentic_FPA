import type { ForecastScreenData } from '../lib/loaders';
import { fmtBps, fmtCr, monthLabel, monthShort, tone } from '../lib/format';
import { ScenarioPanel } from './ScenarioPanel';
import { LineChart, Waterfall } from './charts';
import { Badge, Kpi, Provenance, Section } from './ui';

const DRIVER_LABEL: Record<string, string> = {
  DEMAND: 'Demand outlook',
  FX: 'Exchange rates',
  ORDER_DELAY: 'Order delays',
};
const LINE_LABEL: Record<string, string> = {
  'DEMAND|PRICE': 'Price discounting (actual)',
  'DEMAND|VOLUME': 'Sales volume (actual)',
  'DEMAND|MIX': 'Product mix (actual)',
  'DEMAND|OUTLOOK': 'Lower demand expected',
  'FX|RATE': 'Weaker exchange rates',
  'ORDER_DELAY|TIMING': 'Orders slipping between months',
  'ORDER_DELAY|SLIPPAGE': 'Orders moved past the year end',
};

export function ForecastView({ data }: { data: ForecastScreenData }) {
  const f = data.forecast.comparison;
  const closedIdx = f.months.findIndex((m) => m.period === data.forecast.closed_through);
  return (
    <>
      <h1>Forecast intelligence</h1>
      <p className="sub">
        FY27 revenue by version · actuals closed through {monthLabel(data.forecast.closed_through)}
      </p>

      <div className="grid grid-4">
        <Kpi label="Budget" value={fmtCr(f.full_year.budget)} sub="Full year" />
        <Kpi
          label="Previous forecast"
          value={fmtCr(f.full_year.previous)}
          sub={`Growth vs last year ${fmtBps(f.growth_previous_bps, { signed: true })}`}
        />
        <Kpi
          label="Latest forecast"
          value={fmtCr(f.full_year.latest)}
          sub={`${fmtCr(f.change_vs_previous, { signed: true })} (${fmtBps(f.change_vs_previous_bps, { signed: true })}) vs previous · growth ${fmtBps(f.growth_latest_bps, { signed: true })}`}
          tone={tone(f.change_vs_previous, 'income')}
          verdict={
            f.change_vs_previous === 0
              ? 'Unchanged'
              : f.change_vs_previous < 0
                ? 'Reduced'
                : 'Raised'
          }
        />
        <Kpi
          label="Of which actual to date"
          value={fmtCr(f.actual_to_date_latest)}
          sub={`${fmtCr(f.remaining_latest)} still to come`}
        />
      </div>

      <Section title="Monthly revenue by version">
        <div className="card">
          <LineChart
            title="Monthly revenue: budget, previous forecast, latest forecast and prior year"
            labels={f.months.map((m) => monthShort(m.period))}
            markerAfter={closedIdx}
            series={[
              { name: 'Budget', values: f.months.map((m) => m.budget) },
              { name: 'Previous forecast', values: f.months.map((m) => m.previous) },
              { name: 'Latest forecast (actuals to date)', values: f.months.map((m) => m.latest) },
              { name: 'Prior year', values: f.months.map((m) => m.prior_year) },
            ]}
          />
        </div>
      </Section>

      <Section
        title="Why did the forecast change?"
        aside={
          <Badge tone={f.bridge.reconciles ? 'good' : 'bad'}>
            {f.bridge.reconciles
              ? 'Drivers add up to the change, month by month'
              : `Does not reconcile: ${f.bridge.unreconciled_periods.join(', ')}`}
          </Badge>
        }
      >
        <div className="grid grid-2">
          <div className="card">
            <Waterfall
              title={`Forecast bridge: previous ${fmtCr(f.full_year.previous)} to latest ${fmtCr(f.full_year.latest)}`}
              items={[
                { label: 'Previous', value: f.full_year.previous, kind: 'total' },
                ...Object.entries(f.bridge.by_driver).map(([d, v]) => ({
                  label: DRIVER_LABEL[d] ?? d,
                  value: v,
                  kind: 'delta' as const,
                })),
                { label: 'Latest', value: f.full_year.latest, kind: 'total' },
              ]}
            />
          </div>
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">
                Forecast change by driver, split into actuals to date and months still to come
              </caption>
              <thead>
                <tr>
                  <th scope="col">Driver</th>
                  <th scope="col" className="num">
                    Already happened
                  </th>
                  <th scope="col" className="num">
                    Still to come
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {f.bridge.lines.map((l) => (
                  <tr key={`${l.driver}${l.sub_driver}`}>
                    <th scope="row">
                      {LINE_LABEL[`${l.driver}|${l.sub_driver}`] ?? `${l.driver} ${l.sub_driver}`}
                    </th>
                    <td className="num">{fmtCr(l.actual_to_date, { signed: true })}</td>
                    <td className="num">{fmtCr(l.remaining, { signed: true })}</td>
                    <td className="num">{fmtCr(l.total, { signed: true })}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Total change</th>
                  <td className="num" />
                  <td className="num" />
                  <td className="num">
                    <strong>{fmtCr(f.bridge.total, { signed: true })}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Assumptions that moved">
        <div className="grid grid-2">
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">
                Assumed revenue growth by business unit, by forecast version
              </caption>
              <thead>
                <tr>
                  <th scope="col">Business unit</th>
                  <th scope="col" className="num">
                    Budget growth
                  </th>
                  <th scope="col" className="num">
                    Previous
                  </th>
                  <th scope="col" className="num">
                    Latest
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.forecast.demand_assumptions.map((d) => (
                  <tr key={d.bu_id}>
                    <th scope="row">{d.bu_name}</th>
                    <td className="num">{fmtBps(d.budget_bps)}</td>
                    <td className="num">{fmtBps(d.previous_bps)}</td>
                    <td className={`num ${d.latest_bps !== d.previous_bps ? 'bad' : ''}`}>
                      {fmtBps(d.latest_bps)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">
                Manual planner overrides in the latest forecast
              </caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Where</th>
                  <th scope="col" className="num">
                    Adjustment
                  </th>
                  <th scope="col">Who and why</th>
                </tr>
              </thead>
              <tbody>
                {data.forecast.planner_overrides.map((o) => (
                  <tr key={`${o.period}${o.entity_id}${o.bu_id}`}>
                    <th scope="row">{monthLabel(o.period)}</th>
                    <td>
                      {o.entity_id} / {o.bu_id}
                    </td>
                    <td className="num">{fmtCr(o.delta_inr, { signed: true })}</td>
                    <td>
                      {o.role}: {o.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="chart-note">
          Overrides are manual changes by planners, already inside the demand figures above. Showing
          them keeps judgement visible.
        </p>
      </Section>

      <Section title="What if…?">
        <ScenarioPanel initial={data.scenario} />
      </Section>
      <Provenance refs={[...data.forecast.calc_refs, ...data.scenario.calc_refs]} />
    </>
  );
}
