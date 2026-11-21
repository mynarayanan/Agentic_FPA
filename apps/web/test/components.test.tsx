import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildFactSheet, generateNarrative } from '@fpa/narrative';
import type { NarrativeResult } from '@fpa/narrative';
import { ApprovalPanel, GenerateButton } from '../components/ApprovalPanel';
import { Evidence, SUGGESTIONS } from '../components/AssistantChat';
import { NavLinks } from '../components/NavLinks';
import { Statements, statusNote } from '../components/NarrativePanel';
import { Notice, SetupNotice } from '../components/ui';
import { visibleText } from './helpers';
import { loadCockpit } from '../lib/loaders';
import { testDb } from './helpers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {} }),
  usePathname: () => '/forecast',
}));

describe('narrative status wording', () => {
  const s = (
    status: NarrativeResult['status'],
    fallback_reason: NarrativeResult['fallback_reason'] = null,
  ) => statusNote({ status, fallback_reason });
  it('tells the reader where the words came from', () => {
    expect(s('TEMPLATE', 'NO_LLM').label).toBe('Rule-based summary (no AI)');
    expect(s('OK').label).toBe('AI-written, every number validated');
    expect(s('RETRIED').tone).toBe('info');
    expect(s('FALLBACK', 'GUARD_FAILED').label).toContain('rejected by the validator');
    expect(s('FALLBACK', 'LLM_ERROR').label).toContain('AI unavailable');
    expect(s('FALLBACK', 'GUARD_FAILED').tone).toBe('bad');
  });
});

describe('assistant evidence', () => {
  it('lists each cited figure with its value, basis and calculation id, in an accessible table', async () => {
    const { db } = await testDb();
    const cockpit = await loadCockpit(db);
    const answer = await generateNarrative(null, cockpit.report, {
      question: 'What drove the revenue shortfall?',
    });
    const facts = buildFactSheet(cockpit.report).facts;
    const html = renderToStaticMarkup(<Evidence answer={answer} facts={facts} />);
    const t = visibleText(html);
    expect(html).toContain('<caption');
    expect(t).toMatch(/Evidence \(\d+ figures\)/);
    expect(t).toContain('Revenue variance -₹8.00 Cr Calculated VAR-PNL-001');
    expect(t).toContain('Revenue (actual) ₹92.00 Cr Ledger fact VAR-PNL-001');
  });
  it('renders nothing when an answer cites no figures', () => {
    const empty = {
      headline: { kind: 'CALCULATED', text: 'x', fact_ids: [], calc_refs: [] },
      statements: [],
    } as unknown as NarrativeResult;
    expect(renderToStaticMarkup(<Evidence answer={empty} facts={[]} />)).toBe('');
  });
  it('labels hypotheses so nobody mistakes them for facts', () => {
    const n = {
      headline: { kind: 'CALCULATED', text: 'Revenue fell.', fact_ids: [], calc_refs: [] },
      statements: [
        {
          kind: 'HYPOTHESIS',
          text: 'Customers may have deferred orders.',
          fact_ids: [],
          calc_refs: [],
        },
      ],
    } as unknown as NarrativeResult;
    expect(visibleText(renderToStaticMarkup(<Statements narrative={n} />))).toContain(
      'Hypothesis: needs validation Customers may have deferred orders.',
    );
  });
  it('offers six suggested questions', () => expect(SUGGESTIONS).toHaveLength(6));
});

describe('approval controls', () => {
  it('offers only the steps that make sense for the status', () => {
    const proposed = visibleText(
      renderToStaticMarkup(<ApprovalPanel id="AI-INS-00001" status="PROPOSED" />),
    );
    expect(proposed).toContain('Validate (level 2)');
    expect(proposed).not.toContain('Authorise (level 3)');
    expect(proposed).toContain('Reject');
    const validated = visibleText(
      renderToStaticMarkup(<ApprovalPanel id="AI-INS-00001" status="BUSINESS_VALIDATED" />),
    );
    expect(validated).toContain('Authorise (level 3)');
    expect(validated).not.toContain('Validate (level 2)');
    for (const done of ['AUTHORISED', 'REJECTED']) {
      const t = visibleText(
        renderToStaticMarkup(<ApprovalPanel id="AI-INS-00001" status={done} />),
      );
      expect(t).toContain(`this item is ${done.toLowerCase()}`);
      expect(t).not.toContain('Reject');
    }
  });
  it('warns that identity is asserted, and labels every field', () => {
    const html = renderToStaticMarkup(<ApprovalPanel id="AI-INS-00001" status="PROPOSED" />);
    expect(visibleText(html)).toContain('Identity is asserted, not authenticated');
    expect(html.match(/<label/g)?.length).toBe(4);
    expect(visibleText(html)).toContain('Finance business partner');
    expect(visibleText(html)).not.toContain('AI agent');
  });
  it('the generate control says who may not approve what it files', () => {
    expect(visibleText(renderToStaticMarkup(<GenerateButton period="2026-11" />))).toContain(
      'cannot later validate or authorise',
    );
  });
});

describe('navigation and notices', () => {
  it('marks the current screen for assistive technology', () => {
    const html = renderToStaticMarkup(<NavLinks />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(
      /aria-current="page"[^>]*>Forecast|href="\/forecast"[^>]*aria-current="page"/,
    );
    expect(html).toContain('aria-label="Main"');
    for (const label of ['Cockpit', 'Variance', 'Forecast', 'Actions', 'Assistant'])
      expect(html).toContain(label);
  });
  it('tells a user what to do when the database is missing', () => {
    expect(visibleText(renderToStaticMarkup(<SetupNotice />))).toContain('DATABASE_URL');
    expect(renderToStaticMarkup(<Notice kind="error" title="x" />)).toContain('role="alert"');
  });
});
