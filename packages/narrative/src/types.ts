import { z } from 'zod';
import type { Topic } from './topic';

export type Basis = 'CONFIRMED' | 'CALCULATED';

/** One number the narrative is allowed to talk about. Values come only from the deterministic engine. */
export interface Fact {
  id: string;
  key: string;
  label: string;
  value: number;
  unit: 'inr' | 'pct';
  basis: Basis;
  calc_ref: string;
  /** For variances: 'below budget' / 'above budget' / 'on budget'. For bridge effects: 'reduced revenue' etc. */
  direction?: string;
  favourable?: boolean;
}

export interface FactSheet {
  period: string;
  entity: string | null;
  entity_name: string | null;
  facts: Fact[];
  /** sha256 of period, entity and facts: ties a narrative to the exact numbers it was written from. */
  hash: string;
}

export const KINDS = ['CONFIRMED', 'CALCULATED', 'HYPOTHESIS'] as const;
export type Kind = (typeof KINDS)[number];

export const statementSchema = z.object({
  kind: z.enum(KINDS),
  text: z.string().min(1).max(450),
  fact_ids: z.array(z.string().regex(/^F\d+$/)).max(8),
});
export const narrativeSchema = z.object({
  headline: statementSchema,
  statements: z.array(statementSchema).min(1).max(8),
});
export type Statement = z.infer<typeof statementSchema>;
export type NarrativeDraft = z.infer<typeof narrativeSchema>;

export type ViolationCode =
  | 'BAD_JSON'
  | 'BAD_SHAPE'
  | 'UNKNOWN_FACT'
  | 'TOKEN_NOT_CITED'
  | 'NO_EVIDENCE'
  | 'BASIS_MISMATCH'
  | 'HEDGE_MISSING'
  | 'HEADLINE_KIND'
  | 'NUMBER_NOT_ALLOWED'
  | 'NUMBER_WORD'
  | 'BAD_TOKEN';

export interface Violation {
  where: 'response' | 'headline' | number;
  code: ViolationCode;
  message: string;
}

export interface RenderedStatement {
  kind: Kind;
  text: string;
  fact_ids: string[];
  calc_refs: string[];
}

export type NarrativeStatus = 'OK' | 'RETRIED' | 'FALLBACK' | 'TEMPLATE';
export interface NarrativeResult {
  /** The (sanitised) question this narrative answers, if any, and the topic it was routed to. */
  question: string | null;
  topic: Topic;
  status: NarrativeStatus;
  /** Why the deterministic template was used instead of the model, if it was. */
  fallback_reason: 'NO_LLM' | 'LLM_ERROR' | 'GUARD_FAILED' | null;
  model: string | null;
  prompt_version: string;
  fact_sheet_hash: string;
  prompt_hash: string | null;
  attempts: number;
  /** Violations from the last rejected model response (empty when the model output was accepted). */
  violations: Violation[];
  headline: RenderedStatement;
  statements: RenderedStatement[];
}
