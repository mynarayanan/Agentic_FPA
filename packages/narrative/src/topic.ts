export type Topic = 'profit' | 'revenue' | 'costs' | 'general' | 'forecast' | 'actions' | 'trend';

/** Topics the variance fact sheet cannot answer; the assistant points to the screen that can. */
export const REDIRECTS: Partial<Record<Topic, { screen: string; label: string; message: string }>> =
  {
    forecast: {
      screen: '/forecast',
      label: 'Forecast screen',
      message:
        'Forecast changes and what-if scenarios are on the Forecast screen, where the drivers and the scenario model are calculated by the engine.',
    },
    actions: {
      screen: '/actions',
      label: 'Actions screen',
      message:
        'Recommended corrective actions, their assessed impact and approval status are on the Actions screen.',
    },
    trend: {
      screen: '/variance#trend',
      label: 'Variance screen, trend section',
      message:
        'Whether an overrun is one-off or recurring is shown month by month in the trend section of the Variance screen.',
    },
  };

/** Trim, drop control characters, collapse whitespace and cap the length. Null when nothing is left. */
export function cleanQuestion(raw: string | null | undefined): string | null {
  const noControls = [...(raw ?? '')]
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('');
  const q = noControls.replace(/\s+/g, ' ').trim().slice(0, 300);
  return q === '' ? null : q;
}

/** Deterministic keyword routing. No model is involved in deciding which data answers a question. */
export function topicOf(question: string | null | undefined): Topic {
  const q = (question ?? '').toLowerCase();
  if (/forecast|outlook|full[- ]year|next year|scenario|what[- ]?if|predict/.test(q))
    return 'forecast';
  if (/action|recommend|corrective|what should|approv|authoris|authoriz/.test(q)) return 'actions';
  if (/recurr|trend|one[- ]?off|one[- ]?time|every month|getting worse|month by month/.test(q))
    return 'trend';
  if (/profit|margin|ebitda/.test(q)) return 'profit';
  if (/revenue|sales|pric|discount|volume|mix|order|delay|customer|shortfall/.test(q))
    return 'revenue';
  if (/opex|expens|cost|spend|travel|consult|contractor|saving|overrun/.test(q)) return 'costs';
  return 'general';
}
