import type {
  ApprovalEvent,
  Config,
  ErrorCode,
  Failure,
  LoggedEvent,
  RecState,
  Role,
  Status,
} from './types';
import { DEFAULT_CONFIG, TERMINAL } from './types';

const VALIDATORS: readonly Role[] = ['FINANCE_BUSINESS_PARTNER', 'FINANCE_MANAGER'];
const AUTHORISERS: readonly Role[] = ['CONTROLLER', 'CFO'];
const REJECTERS: readonly Role[] = [...VALIDATORS, ...AUTHORISERS];
const MODIFIERS: readonly Role[] = [...VALIDATORS, ...AUTHORISERS];

export type Transition = {
  ok: true;
  state: RecState;
  logged: Omit<LoggedEvent, 'n' | 'prev_hash' | 'hash'>;
};
const fail = (code: ErrorCode, message: string): Failure => ({ ok: false, code, message });

/**
 * The approval state machine. Pure: (current state, event) -> next state or a precise refusal.
 *
 * PROPOSED --validate--> BUSINESS_VALIDATED --authorise--> AUTHORISED
 *    ^  \\                      |
 *    |   +--reject-->  REJECTED <--reject--+
 *    +------ modify (new revision) -------+
 */
export function applyEvent(
  state: RecState | null,
  ev: ApprovalEvent,
  recId: string,
  cfg: Config = DEFAULT_CONFIG,
): Transition | Failure {
  const { actor } = ev;
  const base = {
    recommendation_id: recId,
    type: ev.type,
    actor_id: actor.id,
    actor_role: actor.role,
    at: ev.at,
    justification: ev.justification ?? null,
    requested_by: null as string | null,
  };

  if (ev.type === 'PROPOSE') {
    if (state) return fail('ALREADY_EXISTS', `${recId} has already been proposed`);
    if (actor.role !== 'AI_AGENT')
      return fail('ROLE_NOT_PERMITTED', 'only the AI agent can propose a recommendation');
    if (!Number.isSafeInteger(ev.amount_inr) || (ev.amount_inr as number) < 0)
      return fail('INVALID_AMOUNT', 'a proposal needs a non-negative integer amount in rupees');
    const requestedBy = ev.requested_by ?? null;
    const next: RecState = {
      id: recId,
      status: 'PROPOSED',
      revision: 1,
      amount_inr: ev.amount_inr as number,
      proposed_by: actor.id,
      requested_by: requestedBy,
      validated_by: null,
      modified_by: null,
    };
    return {
      ok: true,
      state: next,
      logged: {
        ...base,
        revision: 1,
        from_state: null,
        to_state: 'PROPOSED',
        amount_inr: next.amount_inr,
        requested_by: requestedBy,
      },
    };
  }

  if (!state) return fail('NOT_FOUND', `${recId} does not exist`);
  if ((TERMINAL as readonly Status[]).includes(state.status))
    return fail('TERMINAL_STATE', `${recId} is ${state.status} and can no longer change`);

  const involved = (...ids: Array<string | null>): boolean => ids.includes(actor.id);
  const justified = (ev.justification ?? '').trim().length >= cfg.minJustificationChars;
  const done = (
    to: Status,
    patch: Partial<RecState>,
    amount = state.amount_inr,
    revision = state.revision,
  ): Transition => ({
    ok: true,
    state: { ...state, ...patch, status: to, amount_inr: amount, revision },
    logged: { ...base, revision, from_state: state.status, to_state: to, amount_inr: amount },
  });

  switch (ev.type) {
    case 'VALIDATE': {
      if (state.status !== 'PROPOSED')
        return fail(
          'INVALID_TRANSITION',
          `only a PROPOSED item can be validated (this one is ${state.status})`,
        );
      if (!VALIDATORS.includes(actor.role))
        return fail(
          'ROLE_NOT_PERMITTED',
          `${actor.role} cannot validate; use a finance business partner or finance manager`,
        );
      if (involved(state.proposed_by, state.requested_by, state.modified_by))
        return fail(
          'SEGREGATION_OF_DUTIES',
          'you proposed, requested or modified this item and cannot validate it',
        );
      return done('BUSINESS_VALIDATED', { validated_by: actor.id });
    }
    case 'AUTHORISE': {
      if (state.status !== 'BUSINESS_VALIDATED')
        return fail(
          'INVALID_TRANSITION',
          `only a BUSINESS_VALIDATED item can be authorised (this one is ${state.status})`,
        );
      if (!AUTHORISERS.includes(actor.role))
        return fail(
          'ROLE_NOT_PERMITTED',
          `${actor.role} cannot authorise; use a controller or the CFO`,
        );
      if (involved(state.proposed_by, state.requested_by, state.validated_by, state.modified_by))
        return fail(
          'SEGREGATION_OF_DUTIES',
          'you proposed, requested, modified or validated this item and cannot authorise it',
        );
      if (state.amount_inr > cfg.controllerLimitInr && actor.role !== 'CFO')
        return fail(
          'DELEGATION_LIMIT',
          `items above ${cfg.controllerLimitInr} rupees need the CFO to authorise`,
        );
      return done('AUTHORISED', {});
    }
    case 'REJECT': {
      if (!REJECTERS.includes(actor.role))
        return fail('ROLE_NOT_PERMITTED', `${actor.role} cannot reject`);
      if (!justified)
        return fail(
          'JUSTIFICATION_REQUIRED',
          `rejecting needs a justification of at least ${cfg.minJustificationChars} characters`,
        );
      return done('REJECTED', {});
    }
    case 'MODIFY': {
      if (!MODIFIERS.includes(actor.role))
        return fail('ROLE_NOT_PERMITTED', `${actor.role} cannot modify`);
      if (!justified)
        return fail(
          'JUSTIFICATION_REQUIRED',
          `modifying needs a justification of at least ${cfg.minJustificationChars} characters`,
        );
      if (!Number.isSafeInteger(ev.amount_inr) || (ev.amount_inr as number) < 0)
        return fail(
          'INVALID_AMOUNT',
          'a modification needs a non-negative integer amount in rupees',
        );
      return done(
        'PROPOSED',
        { validated_by: null, modified_by: actor.id },
        ev.amount_inr as number,
        state.revision + 1,
      );
    }
    default:
      return fail('INVALID_TRANSITION', `unknown event ${String(ev.type)}`);
  }
}
