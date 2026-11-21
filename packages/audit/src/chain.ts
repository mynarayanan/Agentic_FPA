import { createHash } from 'node:crypto';
import { applyEvent } from './machine';
import type { Transition } from './machine';
import type { ApprovalEvent, Config, Failure, LoggedEvent, RecState } from './types';
import { DEFAULT_CONFIG } from './types';

export const GENESIS_HASH = '0'.repeat(64);

type Unhashed = Omit<LoggedEvent, 'hash'>;

/** Canonical, fixed-order serialisation so the hash never depends on key order. */
function canonical(e: Unhashed): string {
  return JSON.stringify([
    e.n,
    e.recommendation_id,
    e.revision,
    e.type,
    e.actor_id,
    e.actor_role,
    e.from_state,
    e.to_state,
    e.amount_inr,
    e.justification,
    e.requested_by,
    e.at,
    e.prev_hash,
  ]);
}
export const hashEvent = (e: Unhashed): string =>
  createHash('sha256').update(canonical(e)).digest('hex');

/** Validate one event against the history and, if allowed, return the next hash-chained log entry. */
export function appendEvent(
  history: LoggedEvent[],
  ev: ApprovalEvent,
  recId: string,
  cfg: Config = DEFAULT_CONFIG,
): { ok: true; event: LoggedEvent; state: RecState } | Failure {
  const replayed = replay(history, cfg);
  if (!replayed.ok) return replayed;
  const t: Transition | Failure = applyEvent(replayed.state, ev, recId, cfg);
  if (!t.ok) return t;
  const last = history[history.length - 1];
  const unhashed: Unhashed = {
    ...t.logged,
    n: (last?.n ?? 0) + 1,
    prev_hash: last?.hash ?? GENESIS_HASH,
  };
  return { ok: true, event: { ...unhashed, hash: hashEvent(unhashed) }, state: t.state };
}

export interface ChainCheck {
  ok: boolean;
  /** Sequence number of the first bad entry. */
  brokenAt?: number;
  reason?: string;
}

/** Tamper check: sequence is gapless, each entry links to the previous hash, and every hash matches its content. */
export function verifyChain(history: LoggedEvent[]): ChainCheck {
  let prev = GENESIS_HASH;
  for (let i = 0; i < history.length; i++) {
    const e = history[i] as LoggedEvent;
    if (e.n !== i + 1)
      return { ok: false, brokenAt: e.n, reason: `expected sequence ${i + 1} but found ${e.n}` };
    if (e.prev_hash !== prev)
      return { ok: false, brokenAt: e.n, reason: 'link to the previous entry is broken' };
    const { hash, ...rest } = e;
    if (hashEvent(rest) !== hash)
      return { ok: false, brokenAt: e.n, reason: 'entry content does not match its hash' };
    prev = hash;
  }
  return { ok: true };
}

/**
 * Rebuild the current state of a recommendation by re-applying every logged event through the same
 * rules. A history that breaks the chain or the rules is reported as corrupt rather than trusted.
 */
export function replay(
  history: LoggedEvent[],
  cfg: Config = DEFAULT_CONFIG,
): { ok: true; state: RecState | null } | Failure {
  const chain = verifyChain(history);
  if (!chain.ok)
    return {
      ok: false,
      code: 'AUDIT_CORRUPT',
      message: `audit chain broken at entry ${chain.brokenAt}: ${chain.reason}`,
    };
  let state: RecState | null = null;
  for (const e of history) {
    const ev: ApprovalEvent = {
      type: e.type,
      actor: { id: e.actor_id, role: e.actor_role },
      at: e.at,
      justification: e.justification,
      amount_inr: e.amount_inr,
      requested_by: e.requested_by,
    };
    const t: Transition | Failure = applyEvent(state, ev, e.recommendation_id, cfg);
    if (!t.ok)
      return {
        ok: false,
        code: 'AUDIT_CORRUPT',
        message: `entry ${e.n} breaks the approval rules: ${t.message}`,
      };
    if (
      t.logged.to_state !== e.to_state ||
      t.logged.revision !== e.revision ||
      t.logged.from_state !== e.from_state
    ) {
      return {
        ok: false,
        code: 'AUDIT_CORRUPT',
        message: `entry ${e.n} records a transition the rules do not produce`,
      };
    }
    state = t.state;
  }
  return { ok: true, state };
}
