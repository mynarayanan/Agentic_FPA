import { describe, expect, it } from 'vitest';
import { checkNarrative, renderText, renderStatement, tokensIn } from '../src';
import type { NarrativeDraft, Statement, Violation } from '../src';
import { idOf, novSheet } from './fixtures';

const sheet = novSheet();
const id = (k: string) => idOf(sheet, k);
const stmt = (
  text: string,
  fact_ids: string[],
  kind: Statement['kind'] = 'CALCULATED',
): Statement => ({ kind, text, fact_ids });
const draft = (...s: Statement[]): NarrativeDraft => ({
  headline: stmt(`Revenue was {{${id('revenue.variance')}:abs}} below budget.`, [
    id('revenue.variance'),
  ]),
  statements: s,
});
const codes = (v: Violation[]) => v.map((x) => x.code);
const rv = id('revenue.variance');
const ov = id('opex.variance');

describe('guard accepts faithful narratives', () => {
  it('passes placeholders and exact literal figures that belong to cited facts', () => {
    const d = draft(
      stmt(`Revenue missed budget by {{${rv}:abs}}.`, [rv]),
      stmt('Revenue missed budget by ₹8 Cr, which is adverse.', [rv]),
      stmt('Operating expenses ran ₹4.00 Cr above budget, or 11.43% (adverse).', [
        ov,
        id('opex.variance_pct'),
      ]),
      stmt('Consulting (account 6300) is among the largest line variances.', [
        sheet.facts.find((f) => f.label.includes('(6300)'))?.id as string,
      ]),
      stmt(
        'Consulting spend may reflect project timing and needs validation by the business.',
        [],
        'HYPOTHESIS',
      ),
    );
    expect(checkNarrative(d, sheet)).toEqual([]);
  });
  it('renders signed and magnitude placeholders and collects calc refs', () => {
    expect(renderText(`{{${rv}}} / {{${rv}:abs}} / {{F999}}`, sheet)).toBe(
      '-₹8.00 Cr / ₹8.00 Cr / {{F999}}',
    );
    const r = renderStatement(stmt(`{{${rv}}}`, [rv, 'F999']), sheet);
    expect(r.calc_refs).toEqual(['VAR-PNL-001']);
    expect(tokensIn('{{F1}} {{F1:abs}} {{F2}}')).toEqual(['F1', 'F2']);
  });
});

describe('guard rejects every kind of invented or mis-attributed figure', () => {
  it('a literal number that matches no fact', () => {
    const v = checkNarrative(draft(stmt('Revenue missed budget by ₹7.5 Cr.', [rv])), sheet);
    expect(codes(v)).toEqual(['NUMBER_NOT_ALLOWED']);
    expect(v[0]?.where).toBe(0);
    expect(v[0]?.message).toContain('7.5');
  });
  it('a real number attached to the wrong claim (opex overrun quoted for revenue)', () => {
    expect(
      codes(checkNarrative(draft(stmt('Revenue missed budget by ₹4 Cr.', [rv])), sheet)),
    ).toEqual(['NUMBER_NOT_ALLOWED']);
  });
  it('derived arithmetic such as a sum or ratio', () => {
    const v = checkNarrative(
      draft(stmt('Combined, revenue and opex moved ₹12 Cr against plan.', [rv, ov])),
      sheet,
    );
    expect(codes(v)).toEqual(['NUMBER_NOT_ALLOWED']);
  });
  it('a placeholder for a fact that does not exist, or that is not cited', () => {
    expect(codes(checkNarrative(draft(stmt('Revenue was {{F999}}.', ['F999'])), sheet))).toContain(
      'UNKNOWN_FACT',
    );
    expect(codes(checkNarrative(draft(stmt('Revenue was {{F999}}.', [rv])), sheet))).toContain(
      'UNKNOWN_FACT',
    );
    expect(codes(checkNarrative(draft(stmt(`Revenue was {{${rv}}}.`, [ov])), sheet))).toContain(
      'TOKEN_NOT_CITED',
    );
  });
  it('spelled-out amounts', () => {
    expect(
      codes(checkNarrative(draft(stmt('Revenue missed budget by eight crore.', [rv])), sheet)),
    ).toContain('NUMBER_WORD');
    expect(
      codes(checkNarrative(draft(stmt('Costs rose about twelve percent.', [ov])), sheet)),
    ).toContain('NUMBER_WORD');
  });
  it('malformed placeholders', () => {
    expect(
      codes(checkNarrative(draft(stmt('Revenue was {{ F1 }} below.', [rv])), sheet)),
    ).toContain('BAD_TOKEN');
  });
});

describe('guard enforces statement kinds', () => {
  it('requires evidence for CONFIRMED and CALCULATED statements', () => {
    expect(
      codes(checkNarrative(draft(stmt('Things look worse than planned.', [])), sheet)),
    ).toEqual(['NO_EVIDENCE']);
  });
  it('CONFIRMED may cite only ledger facts; CALCULATED must cite a calculated fact', () => {
    expect(
      codes(checkNarrative(draft(stmt(`Variance was {{${rv}}}.`, [rv], 'CONFIRMED')), sheet)),
    ).toEqual(['BASIS_MISMATCH']);
    const actual = id('revenue.actual');
    expect(
      codes(
        checkNarrative(draft(stmt(`Revenue was {{${actual}}}.`, [actual], 'CALCULATED')), sheet),
      ),
    ).toEqual(['BASIS_MISMATCH']);
    expect(
      checkNarrative(draft(stmt(`Revenue was {{${actual}}}.`, [actual], 'CONFIRMED')), sheet),
    ).toEqual([]);
  });
  it('a HYPOTHESIS must be hedged, and cannot be the headline', () => {
    expect(
      codes(
        checkNarrative(
          draft(stmt('Customers cut orders because of the monsoon.', [], 'HYPOTHESIS')),
          sheet,
        ),
      ),
    ).toEqual(['HEDGE_MISSING']);
    const bad: NarrativeDraft = {
      headline: stmt('Demand may have softened.', [], 'HYPOTHESIS'),
      statements: [stmt(`Revenue {{${rv}}}.`, [rv])],
    };
    expect(codes(checkNarrative(bad, sheet))).toContain('HEADLINE_KIND');
  });
  it('hypotheses cannot smuggle in numbers either', () => {
    expect(
      codes(
        checkNarrative(
          draft(stmt('A large customer may have deferred ₹3 Cr of orders.', [], 'HYPOTHESIS')),
          sheet,
        ),
      ),
    ).toEqual(['NUMBER_NOT_ALLOWED']);
  });
  it('reports the headline location', () => {
    const d: NarrativeDraft = {
      headline: stmt('Revenue missed by ₹9 Cr.', [rv]),
      statements: [stmt(`Fine {{${rv}}}.`, [rv])],
    };
    expect(checkNarrative(d, sheet)[0]?.where).toBe('headline');
  });
});
