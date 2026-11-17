import { tokensIn } from './guard';
import type { Fact, FactSheet, Kind, NarrativeDraft, Statement } from './types';

/**
 * Deterministic narrative built only from the fact sheet. Used when no model is configured or when the
 * model's output is rejected by the guard. It is itself guarded in tests for every possible report.
 */
export function templateNarrative(sheet: FactSheet): NarrativeDraft {
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

  const scope = sheet.entity_name ?? 'the group';
  const op = byKey.get('op.variance');
  const headline = has('op.actual', 'op.budget', 'op.variance')
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

  const statements: Statement[] = [
    pnlLine('revenue', 'Revenue', 'was'),
    pnlLine('opex', 'Operating expenses', 'were'),
    pnlLine('other_costs', 'Other operating costs', 'were'),
  ].filter((s): s is Statement => s !== null);

  if (has('bridge.total', 'bridge.timing', 'bridge.price', 'bridge.volume', 'bridge.mix')) {
    statements.push(
      mk(
        'CALCULATED',
        `The revenue variance of ${T('bridge.total')} splits into timing ${T('bridge.timing')}, price ${T('bridge.price')}, volume ${T('bridge.volume')} and product mix ${T('bridge.mix')}.`,
      ),
    );
  }
  const acc = byKey.get('account.1');
  if (acc) {
    statements.push(
      mk(
        'CALCULATED',
        `The largest single account variance was ${acc.label.replace(/ variance$/, '')}: ${T('account.1', true)} ${side(acc)} budget${verdict(acc)}.`,
        acc.id,
      ),
    );
  }
  return { headline, statements: statements.length > 0 ? statements : [{ ...headline }] };
}
