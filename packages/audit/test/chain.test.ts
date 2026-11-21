import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GENESIS_HASH, appendEvent, hashEvent, replay, verifyChain } from '../src';
import type { ApprovalEvent, EventType, LoggedEvent, Role } from '../src';

const ai = 'ai:fpa-agent';
const why = 'A sufficiently long reason';
let clock = 0;
const at = () => `2026-11-20T10:${String(clock++ % 60).padStart(2, '0')}:00.000Z`;
const e = (
  type: EventType,
  id: string,
  role: Role,
  x: Partial<ApprovalEvent> = {},
): ApprovalEvent => ({ type, actor: { id, role }, at: at(), ...x });

function build(events: ApprovalEvent[]): LoggedEvent[] {
  const h: LoggedEvent[] = [];
  for (const ev of events) {
    const r = appendEvent(h, ev, 'R1');
    if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
    h.push(r.event);
  }
  return h;
}
const happy = () =>
  build([
    e('PROPOSE', ai, 'AI_AGENT', { amount_inr: 1_000_000, requested_by: 'rita' }),
    e('VALIDATE', 'vera', 'FINANCE_MANAGER'),
    e('AUTHORISE', 'carl', 'CONTROLLER'),
  ]);

describe('hash-chained log', () => {
  it('links entries from the genesis hash and verifies', () => {
    const h = happy();
    expect(h.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(h[0]?.prev_hash).toBe(GENESIS_HASH);
    expect(h[1]?.prev_hash).toBe(h[0]?.hash);
    expect(h.every((x) => /^[0-9a-f]{64}$/.test(x.hash))).toBe(true);
    expect(verifyChain(h)).toEqual({ ok: true });
    expect(verifyChain([])).toEqual({ ok: true });
  });
  it('replays to the current state', () => {
    expect(replay(happy())).toMatchObject({
      ok: true,
      state: { status: 'AUTHORISED', validated_by: 'vera', revision: 1 },
    });
    expect(replay([])).toEqual({ ok: true, state: null });
  });
  it('is deterministic: the same events give the same hashes', () => {
    clock = 0;
    const a = happy();
    clock = 0;
    const b = happy();
    expect(a.map((x) => x.hash)).toEqual(b.map((x) => x.hash));
  });
  it('detects any edit to any field of any entry', () => {
    const fields: Array<[keyof LoggedEvent, unknown]> = [
      ['actor_id', 'mallory'],
      ['actor_role', 'CFO'],
      ['amount_inr', 1],
      ['justification', 'edited'],
      ['at', '2030-01-01T00:00:00.000Z'],
      ['to_state', 'REJECTED'],
      ['revision', 9],
      ['requested_by', 'someone-else'],
      ['type', 'REJECT'],
    ];
    for (let i = 0; i < 3; i++) {
      for (const [k, v] of fields) {
        const h = happy().map((x) => ({ ...x }));
        (h[i] as Record<string, unknown>)[k] = v;
        const c = verifyChain(h);
        expect(c.ok, `${String(k)} @${i}`).toBe(false);
        expect(c.brokenAt).toBe(i + 1);
      }
    }
  });
  it('detects deleted, reordered and inserted entries, and a re-linked tail', () => {
    const h = happy();
    expect(verifyChain([h[0], h[2]] as LoggedEvent[])).toMatchObject({ ok: false });
    expect(verifyChain([h[1], h[0], h[2]] as LoggedEvent[])).toMatchObject({ ok: false });
    expect(verifyChain([h[0], h[1], h[1], h[2]] as LoggedEvent[])).toMatchObject({ ok: false });
    expect(verifyChain(h.slice(1))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('sequence'),
    });
    const relinked = h.map((x) => ({ ...x }));
    (relinked[2] as LoggedEvent).prev_hash = GENESIS_HASH;
    expect(verifyChain(relinked)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('link'),
    });
  });
  it('replay refuses a history that is internally consistent but breaks the approval rules', () => {
    // A forged chain with valid hashes in which the proposer also authorises.
    const bad: LoggedEvent[] = [];
    const forge = (
      x: ApprovalEvent,
      to: LoggedEvent['to_state'],
      from: LoggedEvent['from_state'],
    ) => {
      const un = {
        n: bad.length + 1,
        recommendation_id: 'R1',
        revision: 1,
        type: x.type,
        actor_id: x.actor.id,
        actor_role: x.actor.role,
        from_state: from,
        to_state: to,
        amount_inr: 5,
        justification: null,
        requested_by: null,
        at: x.at,
        prev_hash: bad[bad.length - 1]?.hash ?? GENESIS_HASH,
      };
      return { ...un, hash: hashEvent(un) };
    };
    bad.push(forge(e('PROPOSE', ai, 'AI_AGENT', { amount_inr: 5 }), 'PROPOSED', null));
    bad.push(forge(e('VALIDATE', 'carl', 'CONTROLLER'), 'BUSINESS_VALIDATED', 'PROPOSED'));
    expect(verifyChain(bad)).toEqual({ ok: true });
    expect(replay(bad)).toMatchObject({
      ok: false,
      code: 'AUDIT_CORRUPT',
      message: expect.stringContaining('entry 2'),
    });
    expect(appendEvent(bad, e('AUTHORISE', 'cleo', 'CFO'), 'R1')).toMatchObject({
      ok: false,
      code: 'AUDIT_CORRUPT',
    });
  });
  it('replay flags a recorded transition the rules would not produce', () => {
    const h = happy();
    const forged = h.map((x) => ({ ...x }));
    (forged[1] as LoggedEvent).to_state = 'AUTHORISED';
    const rehashed = rehash(forged);
    expect(replay(rehashed)).toMatchObject({
      ok: false,
      code: 'AUDIT_CORRUPT',
      message: expect.stringContaining('do not produce'),
    });
  });
  it('refuses to append to a corrupt history and surfaces rule failures from the machine', () => {
    const h = happy().map((x) => ({ ...x }));
    (h[0] as LoggedEvent).amount_inr = 99;
    expect(appendEvent(h, e('REJECT', 'cleo', 'CFO', { justification: why }), 'R1')).toMatchObject({
      ok: false,
      code: 'AUDIT_CORRUPT',
    });
    expect(
      appendEvent(happy(), e('REJECT', 'cleo', 'CFO', { justification: why }), 'R1'),
    ).toMatchObject({ ok: false, code: 'TERMINAL_STATE' });
  });
});

function rehash(h: LoggedEvent[]): LoggedEvent[] {
  const out: LoggedEvent[] = [];
  for (const x of h) {
    const rest: Omit<LoggedEvent, 'hash'> & { hash?: string } = { ...x };
    delete rest.hash;
    const un = { ...rest, prev_hash: out[out.length - 1]?.hash ?? GENESIS_HASH };
    out.push({ ...un, hash: hashEvent(un) });
  }
  return out;
}

describe('invariants under random behaviour (property)', () => {
  const people = ['rita', 'vera', 'vic', 'carl', 'cleo', 'mo', 'ai:fpa-agent'];
  const roles: Role[] = [
    'AI_AGENT',
    'FINANCE_BUSINESS_PARTNER',
    'FINANCE_MANAGER',
    'CONTROLLER',
    'CFO',
    'BUSINESS_OWNER',
    'VIEWER',
  ];
  const step = fc.record({
    type: fc.constantFrom<EventType>('VALIDATE', 'AUTHORISE', 'REJECT', 'MODIFY', 'PROPOSE'),
    who: fc.constantFrom(...people),
    role: fc.constantFrom(...roles),
    amount: fc.integer({ min: 0, max: 60_000_000 }),
    justify: fc.boolean(),
  });
  it('whatever anyone tries, an AUTHORISED item was validated and authorised by two different people who never proposed, requested or modified it', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60_000_000 }),
        fc.array(step, { maxLength: 25 }),
        (amount, steps) => {
          let h: LoggedEvent[] = [];
          const first = appendEvent(
            h,
            {
              type: 'PROPOSE',
              actor: { id: 'ai:fpa-agent', role: 'AI_AGENT' },
              at: at(),
              amount_inr: amount,
              requested_by: 'rita',
            },
            'R1',
          );
          if (!first.ok) throw new Error('propose failed');
          h = [first.event];
          for (const s of steps) {
            const r = appendEvent(
              h,
              {
                type: s.type,
                actor: { id: s.who, role: s.role },
                at: at(),
                amount_inr: s.amount,
                justification: s.justify ? 'a long enough justification' : null,
              },
              'R1',
            );
            if (r.ok) h = [...h, r.event];
          }
          expect(verifyChain(h)).toEqual({ ok: true });
          const state = replay(h);
          expect(state.ok).toBe(true);
          if (!state.ok || !state.state) return;
          const auth = h.filter((x) => x.type === 'AUTHORISE');
          if (state.state.status === 'AUTHORISED') {
            expect(auth).toHaveLength(1);
            const last = h.slice().reverse();
            const authoriser = (last[0] as LoggedEvent).actor_id;
            const lastRevisionStart =
              h.map((x) => x.revision).lastIndexOf(state.state.revision - 1) + 1;
            const thisRevision = h.slice(lastRevisionStart);
            const validator = thisRevision.find((x) => x.type === 'VALIDATE')?.actor_id;
            expect(validator).toBeDefined();
            expect(validator).not.toBe(authoriser);
            for (const forbidden of ['ai:fpa-agent', 'rita', state.state.modified_by]) {
              expect(authoriser).not.toBe(forbidden);
              expect(validator).not.toBe(forbidden);
            }
            const limitOk =
              state.state.amount_inr <= 20_000_000 || (last[0] as LoggedEvent).actor_role === 'CFO';
            expect(limitOk).toBe(true);
          }
          // Nothing ever follows a terminal state.
          const idx = h.findIndex((x) => x.to_state === 'AUTHORISED' || x.to_state === 'REJECTED');
          if (idx >= 0) expect(h).toHaveLength(idx + 1);
        },
      ),
      { numRuns: 400 },
    );
  });
});
