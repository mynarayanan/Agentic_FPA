import { createHash } from 'node:crypto';
import type { VarianceReport } from '@fpa/engine';
import { buildFactSheet } from './facts';
import { checkNarrative, renderStatement } from './guard';
import type { LlmClient } from './llm';
import { PROMPT_VERSION, SYSTEM_PROMPT, buildRetryMessage, buildUserMessage } from './prompt';
import { templateNarrative } from './template';
import { narrativeSchema } from './types';
import type { FactSheet, NarrativeDraft, NarrativeResult, Violation } from './types';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Extract and validate the JSON object from a model reply (tolerates markdown fences and surrounding prose). */
export function parseDraft(raw: string): { draft: NarrativeDraft } | { violations: Violation[] } {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start)
    return {
      violations: [
        { where: 'response', code: 'BAD_JSON', message: 'no JSON object found in the reply' },
      ],
    };
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return {
      violations: [{ where: 'response', code: 'BAD_JSON', message: 'the reply is not valid JSON' }],
    };
  }
  const parsed = narrativeSchema.safeParse(json);
  if (!parsed.success) {
    return {
      violations: parsed.error.issues.slice(0, 5).map((i) => ({
        where: 'response' as const,
        code: 'BAD_SHAPE' as const,
        message: `${i.path.join('.') || 'root'}: ${i.message}`,
      })),
    };
  }
  return { draft: parsed.data };
}

function finish(
  sheet: FactSheet,
  draft: NarrativeDraft,
  meta: Pick<
    NarrativeResult,
    'status' | 'fallback_reason' | 'model' | 'prompt_hash' | 'attempts' | 'violations'
  >,
): NarrativeResult {
  return {
    ...meta,
    prompt_version: PROMPT_VERSION,
    fact_sheet_hash: sheet.hash,
    headline: renderStatement(draft.headline, sheet),
    statements: draft.statements.map((s) => renderStatement(s, sheet)),
  };
}

function templateResult(
  sheet: FactSheet,
  reason: NonNullable<NarrativeResult['fallback_reason']>,
  model: string | null,
  promptHash: string | null,
  attempts: number,
  violations: Violation[],
): NarrativeResult {
  const draft = templateNarrative(sheet);
  const bad = checkNarrative(draft, sheet);
  // Fail closed: the template is guarded too. If this ever fires it is a bug, never shown to a user.
  if (bad.length > 0)
    throw new Error(`template narrative failed its own guard: ${bad[0]?.message}`);
  return finish(sheet, draft, {
    status: reason === 'NO_LLM' ? 'TEMPLATE' : 'FALLBACK',
    fallback_reason: reason,
    model,
    prompt_hash: promptHash,
    attempts,
    violations,
  });
}

/**
 * Produce a guarded narrative for a variance report. The model may phrase, never calculate: its output is
 * accepted only if every number traces to a fact it cited. Otherwise one corrective retry, then a template.
 */
export async function generateNarrative(
  llm: LlmClient | null,
  report: VarianceReport,
  opts: { maxRetries?: number } = {},
): Promise<NarrativeResult> {
  const sheet = buildFactSheet(report);
  if (!llm) return templateResult(sheet, 'NO_LLM', null, null, 0, []);

  const user = buildUserMessage(sheet);
  const promptHash = sha(`${PROMPT_VERSION}\n${SYSTEM_PROMPT}\n${user}`);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: user },
  ];
  const maxAttempts = 1 + (opts.maxRetries ?? 1);
  let violations: Violation[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: string;
    try {
      raw = await llm.complete({ system: SYSTEM_PROMPT, messages, maxTokens: 1500 });
    } catch {
      return templateResult(sheet, 'LLM_ERROR', llm.model, promptHash, attempt, []);
    }
    const parsed = parseDraft(raw);
    violations = 'draft' in parsed ? checkNarrative(parsed.draft, sheet) : parsed.violations;
    if (violations.length === 0 && 'draft' in parsed) {
      return finish(sheet, parsed.draft, {
        status: attempt === 1 ? 'OK' : 'RETRIED',
        fallback_reason: null,
        model: llm.model,
        prompt_hash: promptHash,
        attempts: attempt,
        violations: [],
      });
    }
    messages.push(
      { role: 'assistant', content: raw },
      { role: 'user', content: buildRetryMessage(violations) },
    );
  }
  return templateResult(sheet, 'GUARD_FAILED', llm.model, promptHash, maxAttempts, violations);
}
