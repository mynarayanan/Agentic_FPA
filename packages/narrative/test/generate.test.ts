import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildVarianceReport } from '@fpa/engine';
import type { SalesLineInput } from '@fpa/engine';
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildFactSheet,
  buildRetryMessage,
  buildUserMessage,
  checkNarrative,
  formatFact,
  generateNarrative,
  parseDraft,
  templateNarrative,
} from '../src';
import type { ChatMessage, LlmClient } from '../src';
import { idOf, novReport, novSheet } from './fixtures';

const sheet = novSheet();
const report = novReport();

const SYMBOLS: Record<string, string> = {
  OP_ACTUAL: 'op.actual',
  OP_BUDGET: 'op.budget',
  OP_VAR: 'op.variance',
  REV_VAR: 'revenue.variance',
  REV_PCT: 'revenue.variance_pct',
  PRICE: 'bridge.price',
  TIMING: 'bridge.timing',
  OPEX_VAR: 'opex.variance',
};
const recorded = (): string => {
  const raw = (
    JSON.parse(readFileSync(join(__dirname, 'recordings', 'nov2026-good.json'), 'utf8')) as {
      response: string;
    }
  ).response;
  return raw.replace(
    /\b(OP_ACTUAL|OP_BUDGET|OP_VAR|REV_VAR|REV_PCT|PRICE|TIMING|OPEX_VAR)\b/g,
    (m) => idOf(sheet, SYMBOLS[m] as string),
  );
};

function scripted(responses: Array<string | Error>): LlmClient & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  let i = 0;
  return {
    model: 'fake-model',
    calls,
    async complete({ messages }) {
      calls.push(messages.map((m) => ({ ...m })));
      const r = responses[Math.min(i++, responses.length - 1)] as string | Error;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

describe('generateNarrative: accepted model output', () => {
  it('renders a recorded model reply with engine numbers and complete provenance', async () => {
    const llm = scripted([recorded()]);
    const n = await generateNarrative(llm, report);
    expect(n).toMatchObject({
      status: 'OK',
      fallback_reason: null,
      model: 'fake-model',
      attempts: 1,
      violations: [],
      prompt_version: PROMPT_VERSION,
    });
    expect(n.headline.text).toBe(
      'Operating profit was ₹8.00 Cr against a budget of ₹15.00 Cr, ₹7.00 Cr below budget (adverse).',
    );
    expect(n.statements.map((s) => s.text)).toEqual([
      'Revenue was ₹8.00 Cr below budget, a shortfall of 8.00%.',
      'Price discounting reduced revenue by ₹2.00 Cr and delayed orders by ₹1.00 Cr.',
      'Operating expenses were ₹4.00 Cr above budget (adverse).',
      'The lower delivered units in Industrial Equipment may reflect customers deferring purchases, which the business would need to validate.',
    ]);
    expect(n.statements[1]?.calc_refs).toEqual(['VAR-REV-002']);
    expect(n.statements[3]).toMatchObject({ kind: 'HYPOTHESIS', fact_ids: [], calc_refs: [] });
    expect(n.fact_sheet_hash).toBe(sheet.hash);
    expect(n.prompt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(llm.calls).toHaveLength(1);
  });
  it('accepts a reply wrapped in prose', async () => {
    const n = await generateNarrative(scripted([`Here you go:\n${recorded()}\nThanks!`]), report);
    expect(n.status).toBe('OK');
  });
});

describe('generateNarrative: retry and fallback', () => {
  const inventedNumber = (): string =>
    recorded().replace(`{{${idOf(sheet, 'bridge.price')}:abs}}`, '₹2.5 Cr');
  it('retries once with the validator feedback and succeeds', async () => {
    const llm = scripted([inventedNumber(), recorded()]);
    const n = await generateNarrative(llm, report);
    expect(n).toMatchObject({ status: 'RETRIED', attempts: 2, violations: [] });
    const retry = llm.calls[1] as ChatMessage[];
    expect(retry.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(retry[2]?.content).toContain('NUMBER_NOT_ALLOWED');
    expect(retry[2]?.content).toContain('2.5');
  });
  it('recovers from invalid JSON and from a wrong schema', async () => {
    expect(
      (await generateNarrative(scripted(['not json at all', recorded()]), report)).status,
    ).toBe('RETRIED');
    const wrong = JSON.stringify({
      headline: { kind: 'OPINION', text: 'x', fact_ids: [] },
      statements: [],
    });
    const n = await generateNarrative(scripted([wrong, recorded()]), report);
    expect(n.status).toBe('RETRIED');
  });
  it('falls back to the template when the model keeps failing, and says why', async () => {
    const llm = scripted([inventedNumber()]);
    const n = await generateNarrative(llm, report);
    expect(n).toMatchObject({
      status: 'FALLBACK',
      fallback_reason: 'GUARD_FAILED',
      attempts: 2,
      model: 'fake-model',
    });
    expect(n.violations.map((v) => v.code)).toContain('NUMBER_NOT_ALLOWED');
    expect(n.headline.text).toContain('₹8.00 Cr');
    expect(JSON.stringify(n)).not.toContain('2.5 Cr');
    expect(llm.calls).toHaveLength(2);
  });
  it('honours maxRetries = 0', async () => {
    const llm = scripted([inventedNumber(), recorded()]);
    const n = await generateNarrative(llm, report, { maxRetries: 0 });
    expect(n).toMatchObject({ status: 'FALLBACK', attempts: 1 });
    expect(llm.calls).toHaveLength(1);
  });
  it('falls back when the model call itself fails', async () => {
    const n = await generateNarrative(scripted([new Error('boom: secret-key-123')]), report);
    expect(n).toMatchObject({
      status: 'FALLBACK',
      fallback_reason: 'LLM_ERROR',
      attempts: 1,
      violations: [],
    });
    expect(JSON.stringify(n)).not.toContain('secret-key-123');
  });
  it('uses the template when no model is configured', async () => {
    const n = await generateNarrative(null, report);
    expect(n).toMatchObject({
      status: 'TEMPLATE',
      fallback_reason: 'NO_LLM',
      model: null,
      prompt_hash: null,
      attempts: 0,
    });
  });
});

describe('deterministic template narrative', () => {
  it('states the November scenario correctly', async () => {
    const n = await generateNarrative(null, report);
    expect(n.headline.text).toBe(
      'Operating profit for the group was ₹8.00 Cr against a budget of ₹15.00 Cr, ₹7.00 Cr below budget (adverse).',
    );
    expect(n.statements.map((s) => s.text)).toEqual([
      'Revenue was ₹92.00 Cr versus a budget of ₹100.00 Cr: ₹8.00 Cr (8.00%) below budget (adverse).',
      'Operating expenses were ₹39.00 Cr versus a budget of ₹35.00 Cr: ₹4.00 Cr (11.43%) above budget (adverse).',
      'Other operating costs were ₹45.00 Cr versus a budget of ₹50.00 Cr: ₹5.00 Cr below budget (favourable).',
      'The revenue variance of -₹8.00 Cr splits into timing -₹1.00 Cr, price -₹2.00 Cr, volume -₹3.97 Cr and product mix -₹1.03 Cr.',
      'The largest single account variance was Direct Materials (5000): ₹3.50 Cr below budget (favourable).',
    ]);
  });
  it('names the entity for an entity slice', async () => {
    const n = await generateNarrative(null, novReport('E-IN'));
    expect(n.headline.text).toContain('Operating profit for India Manufacturing');
  });
  it('passes the guard for ANY report, including zero budgets and zero variances (property)', () => {
    const accounts = [
      { account_id: '4000', type: 'REVENUE' as const, name: 'Revenue' },
      { account_id: '5000', type: 'COGS' as const, name: 'Materials' },
      { account_id: '6200', type: 'OPEX' as const, name: 'Travel' },
      { account_id: '6300', type: 'OPEX' as const, name: 'Consulting' },
    ];
    const amt = fc.oneof(
      fc.constant(0),
      fc.integer({ min: 0, max: 5_000_000 }).map((x) => x * 1000),
    );
    const line = fc.record({
      e: fc.constantFrom('E-A', 'E-B'),
      bu: fc.constantFrom('BU-1', 'BU-2'),
      p: fc.integer({ min: 1, max: 99 }),
      qb: fc.integer({ min: 0, max: 40 }),
      qa: fc.integer({ min: 0, max: 60 }),
      d: fc.boolean(),
    });
    fc.assert(
      fc.property(
        fc.array(amt, { minLength: 8, maxLength: 8 }),
        fc.array(line, { maxLength: 8 }),
        fc.option(fc.constantFrom('E-A', 'E-B'), { nil: undefined }),
        (a, ls, entity) => {
          const bud: SalesLineInput[] = ls.map((x, i) => ({
            line_key: `L${i}`,
            entity_id: x.e,
            bu_id: x.bu,
            quantity: x.qb,
            list_price_inr: x.p * 1000,
            discount_inr: 0,
            net_amount_inr: x.qb * x.p * 1000,
            delayed_to_period: null,
          }));
          const act: SalesLineInput[] = bud.map((b, i) => {
            const x = ls[i] as (typeof ls)[number];
            return x.d
              ? { ...b, quantity: 0, net_amount_inr: 0, delayed_to_period: '2099-01' }
              : { ...b, quantity: x.qa, net_amount_inr: x.qa * b.list_price_inr };
          });
          const rowsOf = (v: number[]) =>
            accounts.map((acc, i) => ({ account_id: acc.account_id, amount_inr: v[i] as number }));
          const r = buildVarianceReport({
            period: '2026-11',
            entity,
            actualVersion: 'A',
            budgetVersion: 'B',
            actualGl: rowsOf(a.slice(0, 4)),
            budgetGl: rowsOf(a.slice(4)),
            accounts,
            actualLines: act,
            budgetLines: bud,
          });
          const s = buildFactSheet(r as NonNullable<typeof r>);
          expect(checkNarrative(templateNarrative(s), s)).toEqual([]);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('prompt construction', () => {
  const user = buildUserMessage(sheet);
  it('lists every fact with its engine-formatted value and nothing else from the database', () => {
    for (const f of sheet.facts)
      expect(user).toContain(`${f.id} | ${f.label} | ${formatFact(f)} | basis=${f.basis}`);
    expect(user).toContain('Scope: Group (all entities)');
    expect(user).not.toMatch(/E-IN|fact_gl|SO-DL/);
  });
  it('states the non-negotiable rules', () => {
    expect(SYSTEM_PROMPT).toContain('Never type a financial figure');
    expect(SYSTEM_PROMPT).toContain('Do not invent customers');
    expect(SYSTEM_PROMPT).toContain('Do not recommend actions');
    expect(SYSTEM_PROMPT).toContain('JSON only');
  });
  it('formats retry feedback with locations and caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      where: i as number,
      code: 'NUMBER_NOT_ALLOWED' as const,
      message: 'm',
    }));
    const msg = buildRetryMessage([
      { where: 'headline', code: 'BAD_TOKEN', message: 'h' },
      { where: 'response', code: 'BAD_JSON', message: 'j' },
      ...many,
    ]);
    expect(msg).toContain('headline: BAD_TOKEN');
    expect(msg).toContain('response: BAD_JSON');
    expect(msg).toContain('statement 1: NUMBER_NOT_ALLOWED');
    expect(msg.split('\n').filter((l) => l.startsWith('- ')).length).toBe(12);
  });
});

describe('parseDraft', () => {
  it('reports unusable replies precisely', () => {
    expect(parseDraft('no braces here')).toMatchObject({ violations: [{ code: 'BAD_JSON' }] });
    expect(parseDraft('{ broken')).toMatchObject({ violations: [{ code: 'BAD_JSON' }] });
    const r = parseDraft(
      '{"headline":{"kind":"CALCULATED","text":"x","fact_ids":["bad"]},"statements":[]}',
    );
    expect('violations' in r && r.violations.every((v) => v.code === 'BAD_SHAPE')).toBe(true);
  });
});
