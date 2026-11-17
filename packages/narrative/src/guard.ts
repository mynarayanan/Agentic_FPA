import { allowedNumbers, formatFact, numbersIn } from './facts';
import type { FactSheet, NarrativeDraft, RenderedStatement, Statement, Violation } from './types';

const TOKEN = /\{\{(F\d+)(?::abs)?\}\}/g;
const NUMBER_WORD =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\s+(?:crores?|lakhs?|percent|per\s+cent|rupees)\b/i;
const HEDGE =
  /\b(?:may|might|could|possibly|possible|potentially|suggests?|appears?|likely|unclear|if|needs?\s+(?:to\s+be\s+)?(?:validated|confirmed)|requires?\s+validation)\b/i;

export const tokensIn = (text: string): string[] => [
  ...new Set([...text.matchAll(TOKEN)].map((m) => m[1] as string)),
];

/** Replace {{F3}} with the signed display value and {{F3:abs}} with the magnitude. Unknown ids are left untouched. */
export function renderText(text: string, sheet: FactSheet): string {
  return text.replace(/\{\{(F\d+)(:abs)?\}\}/g, (whole, id: string, abs?: string) => {
    const f = sheet.facts.find((x) => x.id === id);
    return f ? formatFact(f, Boolean(abs)) : whole;
  });
}

export function renderStatement(s: Statement, sheet: FactSheet): RenderedStatement {
  const refs = [
    ...new Set(
      s.fact_ids
        .map((id) => sheet.facts.find((f) => f.id === id)?.calc_ref)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  return { kind: s.kind, text: renderText(s.text, sheet), fact_ids: s.fact_ids, calc_refs: refs };
}

function checkStatement(
  s: Statement,
  where: Violation['where'],
  sheet: FactSheet,
  isHeadline: boolean,
): Violation[] {
  const out: Violation[] = [];
  const v = (code: Violation['code'], message: string): void =>
    void out.push({ where, code, message });
  const byId = new Map(sheet.facts.map((f) => [f.id, f]));

  const unknown = s.fact_ids.filter((id) => !byId.has(id));
  if (unknown.length > 0)
    v('UNKNOWN_FACT', `fact_ids refer to facts that do not exist: ${unknown.join(', ')}`);
  const tokens = tokensIn(s.text);
  const unknownTokens = tokens.filter((id) => !byId.has(id));
  if (unknownTokens.length > 0)
    v(
      'UNKNOWN_FACT',
      `text uses placeholders for facts that do not exist: ${unknownTokens.join(', ')}`,
    );
  const uncited = tokens.filter((id) => byId.has(id) && !s.fact_ids.includes(id));
  if (uncited.length > 0)
    v(
      'TOKEN_NOT_CITED',
      `placeholders ${uncited.join(', ')} are used in the text but missing from fact_ids`,
    );

  const cited = s.fact_ids
    .map((id) => byId.get(id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));
  if (isHeadline && s.kind === 'HYPOTHESIS')
    v('HEADLINE_KIND', 'the headline must be CONFIRMED or CALCULATED, not a hypothesis');
  if (s.kind !== 'HYPOTHESIS' && cited.length === 0)
    v('NO_EVIDENCE', `a ${s.kind} statement must cite at least one fact`);
  if (s.kind === 'CONFIRMED' && cited.some((f) => f.basis !== 'CONFIRMED'))
    v(
      'BASIS_MISMATCH',
      'a CONFIRMED statement may cite only CONFIRMED facts; use CALCULATED when citing variances or effects',
    );
  if (s.kind === 'CALCULATED' && cited.length > 0 && !cited.some((f) => f.basis === 'CALCULATED'))
    v(
      'BASIS_MISMATCH',
      'a CALCULATED statement must cite at least one CALCULATED fact; use CONFIRMED for plain ledger figures',
    );
  if (s.kind === 'HYPOTHESIS' && !HEDGE.test(s.text))
    v(
      'HEDGE_MISSING',
      'a HYPOTHESIS must be hedged (may, could, suggests...) and say it needs business validation',
    );

  const rendered = renderText(s.text, sheet);
  if (/\{\{|\}\}/.test(rendered))
    v('BAD_TOKEN', 'malformed or unknown placeholder left in the text');
  if (NUMBER_WORD.test(rendered))
    v('NUMBER_WORD', 'amounts and percentages must use placeholders, not spelled-out numbers');
  const allowed = new Set<string>();
  for (const f of cited) for (const n of allowedNumbers(f)) allowed.add(n);
  for (const n of numbersIn(rendered)) {
    if (!allowed.has(n))
      v('NUMBER_NOT_ALLOWED', `the number ${n} is not a value of any fact cited by this statement`);
  }
  return out;
}

/** Validate a parsed narrative against the fact sheet. An empty result means every number is traceable to a cited fact. */
export function checkNarrative(draft: NarrativeDraft, sheet: FactSheet): Violation[] {
  return [
    ...checkStatement(draft.headline, 'headline', sheet, true),
    ...draft.statements.flatMap((s, i) => checkStatement(s, i, sheet, false)),
  ];
}
