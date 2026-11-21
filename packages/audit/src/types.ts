export type Role =
  | 'AI_AGENT'
  | 'FINANCE_BUSINESS_PARTNER'
  | 'FINANCE_MANAGER'
  | 'CONTROLLER'
  | 'CFO'
  | 'BUSINESS_OWNER'
  | 'VIEWER';
export const ROLES: readonly Role[] = [
  'AI_AGENT',
  'FINANCE_BUSINESS_PARTNER',
  'FINANCE_MANAGER',
  'CONTROLLER',
  'CFO',
  'BUSINESS_OWNER',
  'VIEWER',
];

/** Level 1 = PROPOSED (AI insight), level 2 = BUSINESS_VALIDATED, level 3 = AUTHORISED. */
export type Status = 'PROPOSED' | 'BUSINESS_VALIDATED' | 'AUTHORISED' | 'REJECTED';
export const APPROVAL_LEVELS: readonly Exclude<Status, 'REJECTED'>[] = [
  'PROPOSED',
  'BUSINESS_VALIDATED',
  'AUTHORISED',
];
export const TERMINAL: readonly Status[] = ['AUTHORISED', 'REJECTED'];

export type EventType = 'PROPOSE' | 'VALIDATE' | 'AUTHORISE' | 'REJECT' | 'MODIFY';
export const EVENT_TYPES: readonly EventType[] = [
  'PROPOSE',
  'VALIDATE',
  'AUTHORISE',
  'REJECT',
  'MODIFY',
];

export interface Actor {
  id: string;
  role: Role;
}

/** Current state of one recommendation, derived by replaying its events. */
export interface RecState {
  id: string;
  status: Status;
  revision: number;
  amount_inr: number;
  proposed_by: string;
  /** The human who asked the AI agent to produce the recommendation. */
  requested_by: string | null;
  validated_by: string | null;
  /** Who last modified the amount in the current revision (cannot then validate or authorise it). */
  modified_by: string | null;
}

export interface ApprovalEvent {
  type: EventType;
  actor: Actor;
  /** ISO timestamp supplied by the caller (the domain code never reads a clock). */
  at: string;
  justification?: string | null;
  /** PROPOSE: the proposed amount. MODIFY: the new amount. */
  amount_inr?: number;
  /** PROPOSE only. */
  requested_by?: string | null;
}

export interface LoggedEvent {
  n: number;
  recommendation_id: string;
  revision: number;
  type: EventType;
  actor_id: string;
  actor_role: Role;
  from_state: Status | null;
  to_state: Status;
  amount_inr: number;
  justification: string | null;
  requested_by: string | null;
  at: string;
  prev_hash: string;
  hash: string;
}

export type ErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'TERMINAL_STATE'
  | 'INVALID_TRANSITION'
  | 'ROLE_NOT_PERMITTED'
  | 'SEGREGATION_OF_DUTIES'
  | 'DELEGATION_LIMIT'
  | 'JUSTIFICATION_REQUIRED'
  | 'INVALID_AMOUNT'
  | 'AUDIT_CORRUPT';

export interface Failure {
  ok: false;
  code: ErrorCode;
  message: string;
}

export interface Config {
  /** Items above this amount need the CFO to authorise. */
  controllerLimitInr: number;
  minJustificationChars: number;
}
export const DEFAULT_CONFIG: Config = { controllerLimitInr: 20_000_000, minJustificationChars: 10 };
