import { tokensIn } from './guard';
import type { Topic } from './topic';
import type { Fact, FactSheet, Kind, NarrativeDraft, Statement } from './types';

/**
 * Deterministic narrative built only from the fact sheet. Used when no model is configured or when the
 * model's output is rejected by the guard. It is itself guarded in tests for every possible report and topic.
 */
export function templateNarrative(sheet: FactSheet, topic: Topic = 'general'): NarrativeDraft {
  const byKey = new Map(sheet.facts.map((f) => [f.key, f]));
  const T = (key: string, abs = false): string => {
    const f = byKey.get(key);
    return f ? `{{${f.id}${abs ? ':abs' : ''}}}` : '';
  };
  const has = (...keys: string[]): boolean => keys.every((k) => byKey.has(k));
  const side = (f: Fact | undefined): string =>
    !f || f.value === 0 ? 'in line with' : f.value < 0 ? 'below' : 'above';
  const verdict = (f: Fact | undefined): string =>
    !f || f.value === 0 ? '' : f.favourable ? ' (favourable)' : ' (adverse)';
  /** Always cite the variance fact being described, even when its value is zero and no placeholder is shown. */
  const mk = (kind: Kind, text: string, ...cited: Array<string | undefined>): Statement => {
    const ids = [...new Set([...tokensIn(text), ...cited.filter((x): x is string => Boolean(x))])];
    return { kind, text, fact_ids: ids };
  };
  const idOf = (key: string): string | undefined => byKey.get(key)?.id;

  /** "<Label> was <actual> versus a budget of <budget>: <abs variance> (<pct>) below|above budget (adverse|favourable)." */
  const pnlLine = (key: string, label: string, verb: 'was' | 'were'): Statement | null => {
    if (!has(`${key}.actual`, `${key}.budget`, `${key}.variance`)) return null;
    const v = byKey.get(`${key}.variance`);
    const moved = v !== undefined && v.value !== 0;
    const pct = moved && has(`${key}.variance_pct`) ? ` (${T(`${key}.variance_pct`, true)})` : '';
    const amount = moved ? `${T(`${key}.variance`, true)}${pct} ` : '';
    return mk(
      'CALCULATED',
      `${label} ${verb} ${T(`${key}.actual`)} versus a budget of ${T(`${key}.budget`)}: ${amount}${side(v)} budget${verdict(v)}.`,
      idOf(`${key}.variance`),
    );
  };

  const bridge = (): Statement | null =>
    has('bridge.total', 'bridge.timing', 'bridge.price', 'bridge.volume', 'bridge.mix')
      ? mk(
          'CALCULATED',
          `The revenue variance of ${T('bridge.total')} splits into timing ${T('bridge.timing')}, price ${T('bridge.price')}, volume ${T('bridge.volume')} and product mix ${T('bridge.mix')}.`,
        )
      : null;
  const account = (n: number, lead: string): Statement | null => {
    const acc = byKey.get(`account.${n}`);
    return acc
      ? mk(
          'CALCULATED',
          `${lead} ${acc.label.replace(/ variance$/, '')}: ${T(`account.${n}`, true)} ${side(acc)} budget${verdict(acc)}.`,
          acc.id,
        )
      : null;
  };
  const cell = (): Statement | null => {
    const c = byKey.get('cell.1');
    return c
      ? mk(
          'CALCULATED',
          `The largest revenue variance by entity and business unit was ${c.label.replace(/ revenue variance$/, '')}: ${T('cell.1', true)} ${side(c)} budget${verdict(c)}.`,
          c.id,
        )
      : null;
  };
  const present = (xs: Array<Statement | null>): Statement[] =>
    xs.filter((s): s is Statement => s !== null);

  const scope = sheet.entity_name ?? 'the group';
  const op = byKey.get('op.variance');
  const opHeadline = has('op.actual', 'op.budget', 'op.variance')
    ? mk(
        'CALCULATED',
        `Operating profit for ${scope} was ${T('op.actual')} against a budget of ${T('op.budget')}, ${op && op.value !== 0 ? `${T('op.variance', true)} ` : ''}${side(op)} budget${verdict(op)}.`,
        idOf('op.variance'),
      )
    : mk(
        'CALCULATED',
        `Revenue for ${scope} was ${T('revenue.actual')} against a budget of ${T('revenue.budget')}.`,
        idOf('revenue.variance'),
      );
  const revenue = pnlLine('revenue', 'Revenue', 'was');
  const opex = pnlLine('opex', 'Operating expenses', 'were');
  const other = pnlLine('other_costs', 'Other operating costs', 'were');

  let headline: Statement = opHeadline;
  let statements: Statement[];
  if (topic === 'revenue' && revenue) {
    headline = revenue;
    statements = present([bridge(), cell(), opHeadline]);
  } else if (topic === 'costs' && opex) {
    headline = opex;
    statements = present([
      other,
      account(1, 'The largest single cost-account variance was'),
      account(2, 'The next largest was'),
      account(3, 'Then'),
      opHeadline,
    ]);
  } else {
    statements = present([
      revenue,
      opex,
      other,
      bridge(),
      account(1, 'The largest single account variance was'),
    ]);
  }
  return { headline, statements: statements.length > 0 ? statements : [{ ...headline }] };
}
