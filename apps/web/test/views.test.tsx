import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateRecommendations, recordEvent } from '@fpa/db';
import type { Db } from '@fpa/db';
import { ActionsView } from '../components/ActionsView';
import { AssistantView } from '../components/AssistantView';
import { CockpitView } from '../components/CockpitView';
import { ForecastView } from '../components/ForecastView';
import { VarianceView } from '../components/VarianceView';
import {
  loadActions,
  loadAssistant,
  loadCockpit,
  loadForecast,
  loadVariance,
} from '../lib/loaders';
import { testDb, visibleText } from './helpers';

// Client components call useRouter/usePathname; outside a mounted Next app they need stand-ins.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => '/' }));

let db: Db;
beforeAll(async () => {
  db = (await testDb()).db;
});

/** Checks every screen must pass: no broken numbers, accessible tables and charts. */
function expectSound(html: string) {
  const text = visibleText(html);
  expect(text).not.toMatch(/NaN|undefined|\[object Object\]|Infinity/);
  const tables = html.match(/<table[\s>]/g)?.length ?? 0;
  const captions = html.match(/<caption/g)?.length ?? 0;
  expect(captions, 'every table needs a caption').toBeGreaterThanOrEqual(tables);
  for (const m of html.matchAll(/<svg\b[^>]*role="img"[^>]*>/g))
    expect(m[0], 'chart needs a label').toMatch(/aria-label="[^"]+"/);
  expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
}

describe('cockpit', () => {
  it('shows the CFO scenario numbers, the alerts and the explanation', async () => {
    const html = renderToStaticMarkup(<CockpitView data={await loadCockpit(db)} />);
    const t = visibleText(html);
    expect(t).toContain('Nov 2026');
    expect(t).toMatch(/Revenue ₹92\.00 Cr Budget ₹100\.00 Cr · -₹8\.00 Cr \(-8\.00%\)/);
    expect(t).toMatch(
      /Operating expenses ₹39\.00 Cr Budget ₹35\.00 Cr · \+₹4\.00 Cr \(\+11\.43%\)/,
    );
    expect(t).toMatch(/Operating profit ₹8\.00 Cr Budget ₹15\.00 Cr · -₹7\.00 Cr/);
    expect(t).toMatch(
      /Full-year revenue forecast ₹1150\.00 Cr Previous ₹1200\.00 Cr · -₹50\.00 Cr \(-4\.17%\)/,
    );
    expect(t).toContain('Operating profit is ₹7.00 Cr below budget.');
    expect(t).toContain(
      'Operating profit for the group was ₹8.00 Cr against a budget of ₹15.00 Cr',
    );
    expect(t).toContain('Rule-based summary (no AI)');
    expectSound(html);
  });
  it('words the verdicts so colour is never the only signal', async () => {
    const t = visibleText(renderToStaticMarkup(<CockpitView data={await loadCockpit(db)} />));
    expect(t.match(/Adverse/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it('says there are no recommendations yet', async () => {
    const t = visibleText(renderToStaticMarkup(<CockpitView data={await loadCockpit(db)} />));
    expect(t).toContain('No recommendations have been filed for Nov 2026 yet.');
  });
});

describe('variance', () => {
  it('shows the P&L, the bridge that sums to -8 Cr, drivers and the recurring trend', async () => {
    const html = renderToStaticMarkup(<VarianceView data={await loadVariance(db, {})} />);
    const t = visibleText(html);
    expect(t).toMatch(/Revenue ₹100\.00 Cr ₹92\.00 Cr -₹8\.00 Cr -8\.00% Adverse/);
    expect(t).toMatch(/Other operating costs ₹50\.00 Cr ₹45\.00 Cr -₹5\.00 Cr -10\.00% Favourable/);
    expect(t).toMatch(/Timing -₹1\.00 Cr/);
    expect(t).toMatch(/Price -₹2\.00 Cr/);
    expect(t).toMatch(/Total -₹8\.00 Cr Equals actual minus budget exactly/);
    expect(t).toContain('Industrial Equipment');
    expect(t).toContain('Consulting & Professional Fees (6300)');
    expect(t).toMatch(/Travel .* \+40\.00%/);
    expect(html).toContain('id="trend"');
    expect(html).toContain('data-tone="bad"');
    expect(t).toContain('does not start at zero');
    expectSound(html);
  });
  it('offers the closed periods and entities as plain form fields', async () => {
    const html = renderToStaticMarkup(<VarianceView data={await loadVariance(db, {})} />);
    const form = /<form\b[^>]*>/.exec(html)?.[0] ?? '';
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/variance"');
    expect(html.match(/<option value="2026-\d\d"/g)).toHaveLength(8);
    expect(html).toContain('India Manufacturing');
  });
  it('an entity slice shows that entity only, and its bridge adds up', async () => {
    const data = await loadVariance(db, { entity: 'E-IN' });
    const html = renderToStaticMarkup(<VarianceView data={data} />);
    const t = visibleText(html);
    expect(t).toContain('Nov 2026 · India Manufacturing');
    expect(data.report.revenue_bridge?.cells.every((c) => c.entity_id === 'E-IN')).toBe(true);
    expect(t).not.toContain('Europe Manufacturing Industrial');
    expectSound(html);
  });
  it('an earlier period has no sales detail, so it says so instead of drawing a bridge', async () => {
    const html = renderToStaticMarkup(
      <VarianceView data={await loadVariance(db, { period: '2026-10' })} />,
    );
    expect(visibleText(html)).toContain('revenue bridge is not shown for Oct 2026');
    expect(html).not.toContain('Revenue bridge: budget to actual');
    expectSound(html);
  });
  it('falls back to the latest period for an unknown or malicious one, and ignores an unknown entity', async () => {
    const d = await loadVariance(db, { period: "2026-11'; drop table fact_gl;--", entity: 'E-ZZ' });
    expect(d.period).toBe('2026-11');
    expect(d.entity).toBeUndefined();
    expect((await loadVariance(db, { period: '2030-01' })).period).toBe('2026-11');
  });
});

describe('forecast', () => {
  it('shows versions, the reconciled driver bridge, moved assumptions and the what-if', async () => {
    const html = renderToStaticMarkup(<ForecastView data={await loadForecast(db)} />);
    const t = visibleText(html);
    expect(t).toMatch(
      /Latest forecast ₹1150\.00 Cr -₹50\.00 Cr \(-4\.17%\) vs previous · growth \+3\.14% Reduced/,
    );
    expect(t).toContain('Previous forecast ₹1200.00 Cr Growth vs last year +7.62%');
    expect(t).toContain('Drivers add up to the change, month by month');
    expect(t).toMatch(/Weaker exchange rates ₹0\.00 Cr -₹10\.00 Cr -₹10\.00 Cr/);
    expect(t).toMatch(/Orders moved past the year end ₹0\.00 Cr -₹15\.00 Cr -₹15\.00 Cr/);
    expect(t).toMatch(/Industrial Equipment 8\.00% 8\.00% 3\.00%/);
    expect(t).toContain('Pipeline conversion lowered to historical average');
    expect(t).toContain('forecast →');
    expect(t).toContain('EBITDA proxy');
    expect(t).toMatch(/Sales volume -5%/);
    expect(t).toMatch(/Raw material cost \+3%/);
    expectSound(html);
  });
  it('draws four series and a bridge with five bars', async () => {
    const html = renderToStaticMarkup(<ForecastView data={await loadForecast(db)} />);
    expect(html.match(/<path d="M/g)).toHaveLength(4);
    expect(html.match(/data-tone=/g)).toHaveLength(5);
  });
  it('the what-if table shows the engine result for the default shocks', async () => {
    const data = await loadForecast(db);
    const t = visibleText(renderToStaticMarkup(<ForecastView data={data} />));
    expect(data.scenario.result.shocks).toEqual({
      volume_bps: -500,
      price_bps: 0,
      material_cost_bps: 300,
      opex_bps: 0,
    });
    expect(t).toMatch(
      /Operating profit \(EBITDA proxy\) ₹\d+\.\d\d Cr ₹\d+\.\d\d Cr ₹\d+\.\d\d Cr ₹\d+\.\d\d Cr -₹15\.90 Cr/,
    );
  });
});

describe('actions', () => {
  it('invites generation when nothing has been filed, with no approval controls', async () => {
    const { resetAuditLog } = await import('@fpa/db');
    await resetAuditLog(db);
    const html = renderToStaticMarkup(<ActionsView data={await loadActions(db)} />);
    const t = visibleText(html);
    expect(t).toContain('No recommendations yet');
    expect(t).toContain('Generate recommendations');
    expect(t).not.toContain('Validate (level 2)');
    expectSound(html);
  });
  it('after generation shows the 14.3 Cr headline becoming 3.5 Cr, with the audit trail and the right buttons per status', async () => {
    await generateRecommendations(db, {
      period: '2026-11',
      requestedBy: 'rita',
      now: '2026-11-20T10:00:00.000Z',
    });
    await recordEvent(db, 'AI-INS-00002', {
      type: 'VALIDATE',
      actor: { id: 'vera', role: 'FINANCE_BUSINESS_PARTNER' },
      at: '2026-11-20T10:05:00.000Z',
    });
    await recordEvent(db, 'AI-INS-00002', {
      type: 'AUTHORISE',
      actor: { id: 'carl', role: 'CONTROLLER' },
      at: '2026-11-20T10:10:00.000Z',
    });
    const data = await loadActions(db);
    const html = renderToStaticMarkup(<ActionsView data={data} />);
    const t = visibleText(html);
    expect(data.totals).toMatchObject({
      count: 4,
      headline_inr: 143_000_000,
      revenue_recovery_inr: 100_000_000,
      net_in_year_profit_inr: 35_000_000,
    });
    expect(t).toMatch(/Headline potential ₹14\.30 Cr/);
    expect(t).toMatch(/Net in-year profit ₹3\.50 Cr/);
    expect(t).toMatch(/Share of the profit gap closed 50\.00% Gap ₹7\.00 Cr/);
    expect(t).toContain('AI-INS-00002');
    expect(t).toContain('Authorised (level 3)');
    expect(t).toMatch(/Proposed \(level 1\)/);
    expect(t).toContain('No further actions: this item is authorised.');
    expect(t).toContain('PROPOSE ai:fpa-agent (AI_AGENT)');
    expect(t).toContain('VALIDATE vera (FINANCE_BUSINESS_PARTNER) PROPOSED → BUSINESS_VALIDATED');
    expect(t).toContain('chain intact');
    expect(t).toContain(
      'Confirmed orders pushed past the financial year end: ₹15.00 Cr, 3 items (fact_order_book)',
    );
    expect(t).toContain('Overlaps ACT-001');
    expect((html.match(/Validate \(level 2\)/g) ?? []).length).toBe(3);
    expect((html.match(/Authorise \(level 3\)/g) ?? []).length).toBe(0);
    expectSound(html);
  });
  it('shows a broken audit log as an alert at the top', async () => {
    const data = await loadActions(db);
    data.audit = {
      ok: false,
      recommendations: 4,
      events: 6,
      problems: [{ recommendation_id: 'AI-INS-00002', problem: 'chain broken at entry 2' }],
    };
    const html = renderToStaticMarkup(<ActionsView data={data} />);
    expect(html).toContain('role="alert"');
    expect(visibleText(html)).toContain('AI-INS-00002: chain broken at entry 2');
  });
});

describe('assistant', () => {
  it('renders the suggested questions and explains what the answers are based on', async () => {
    const html = renderToStaticMarkup(<AssistantView data={await loadAssistant(db, {})} />);
    const t = visibleText(html);
    expect(t).toContain('Why is operating profit below budget?');
    expect(t).toContain('Is the opex overrun recurring?');
    expect(t).toContain('Every number in an answer comes from the calculation engine.');
    expect(t).toContain('AI wording needs the access token.');
    expect(html.match(/class="chip"/g)?.length).toBe(6);
    expectSound(html);
  });
});
