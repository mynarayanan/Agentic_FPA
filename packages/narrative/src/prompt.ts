import { formatFact } from './facts';
import type { FactSheet, Violation } from './types';

export const PROMPT_VERSION = 'nar-1';

export const SYSTEM_PROMPT = `You write the narrative for a Finance team's budget-versus-actual review. You explain results using ONLY the numbered facts you are given. The numbers were calculated by a deterministic engine; you never calculate anything.

Rules:
1. Never type a financial figure or percentage yourself. To insert a fact's value write its placeholder: {{F12}} gives the signed value (for example -₹8.00 Cr), {{F12:abs}} gives the magnitude without a sign. Pair {{F12:abs}} with words such as "below budget" or "above budget" taken from the fact's direction.
2. Every statement must list in "fact_ids" every fact whose placeholder it uses.
3. Kinds: CONFIRMED = only plain ledger figures (facts with basis CONFIRMED). CALCULATED = variances and bridge effects (facts with basis CALCULATED). HYPOTHESIS = a possible business explanation that is NOT shown in the data. A hypothesis must be hedged (may, could, suggests) and must say it needs validation by the business.
4. Do not invent customers, products, events, causes or numbers. The data contains none of them. Do not do arithmetic: no sums, differences or ratios; if a figure is not listed, do not state it.
5. Do not recommend actions and do not claim that any action has been taken.
6. Respect each fact's direction and favourable flag. A cost above budget is adverse; revenue below budget is adverse.
7. Write concisely for a CFO: one headline sentence and 4 to 7 supporting statements, each a single sentence.
8. Reply with JSON only (no markdown, no commentary) in exactly this shape:
{"headline":{"kind":"CALCULATED","text":"...","fact_ids":["F1"]},"statements":[{"kind":"CALCULATED","text":"...","fact_ids":["F2","F3"]}]}`;

export function buildUserMessage(sheet: FactSheet): string {
  const lines = sheet.facts.map((f) => {
    const extra = [
      f.direction ? `direction=${f.direction}` : '',
      f.favourable === undefined ? '' : f.favourable ? 'favourable' : 'adverse',
    ]
      .filter(Boolean)
      .join(' ');
    return `${f.id} | ${f.label} | ${formatFact(f)} | basis=${f.basis} | ref=${f.calc_ref}${extra ? ` | ${extra}` : ''}`;
  });
  return [
    `Period: ${sheet.period}`,
    `Scope: ${sheet.entity_name ?? 'Group (all entities)'}`,
    '',
    'FACTS',
    ...lines,
    '',
    'Write the narrative JSON now.',
  ].join('\n');
}

export function buildRetryMessage(violations: Violation[]): string {
  const list = violations
    .slice(0, 12)
    .map(
      (v) =>
        `- ${v.where === 'response' ? 'response' : v.where === 'headline' ? 'headline' : `statement ${v.where + 1}`}: ${v.code}: ${v.message}`,
    );
  return `Your previous reply was rejected by the validator:\n${list.join('\n')}\n\nFix every problem and reply again with the complete JSON only. Use placeholders for all figures.`;
}
