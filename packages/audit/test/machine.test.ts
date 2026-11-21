import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, applyEvent } from '../src';
import type { ApprovalEvent, EventType, RecState, Role } from '../src';

const AT = '2026-11-20T10:00:00.000Z';
const ev = (
  type: EventType,
  id: string,
  role: Role,
  extra: Partial<ApprovalEvent> = {},
): ApprovalEvent => ({ type, actor: { id, role }, at: AT, ...extra });
const ai = 'ai:fpa-agent';
const base = (o: Partial<RecState> = {}): RecState => ({
  id: 'R1',
  status: 'PROPOSED',
  revision: 1,
  amount_inr: 10_000_000,
  proposed_by: ai,
  requested_by: 'rita',
  validated_by: null,
  modified_by: null,
  ...o,
});
const run = (state: RecState | null, e: ApprovalEvent) => applyEvent(state, e, 'R1');

describe('PROPOSE', () => {
  it('creates revision 1 in PROPOSED, recording who asked', () => {
    const r = run(null, ev('PROPOSE', ai, 'AI_AGENT', { amount_inr: 5, requested_by: 'rita' }));
    expect(r).toMatchObject({
      ok: true,
      state: {
        status: 'PROPOSED',
        revision: 1,
        amount_inr: 5,
        proposed_by: ai,
        requested_by: 'rita',
      },
      logged: { from_state: null, to_state: 'PROPOSED', requested_by: 'rita' },
    });
  });
  it('defaults requested_by to null', () => {
    expect(run(null, ev('PROPOSE', ai, 'AI_AGENT', { amount_inr: 0 }))).toMatchObject({
      ok: true,
      state: { requested_by: null },
    });
  });
  it('only the AI agent may propose, once, with a valid amount', () => {
    expect(run(null, ev('PROPOSE', 'bob', 'CFO', { amount_inr: 5 }))).toMatchObject({
      ok: false,
      code: 'ROLE_NOT_PERMITTED',
    });
    expect(run(base(), ev('PROPOSE', ai, 'AI_AGENT', { amount_inr: 5 }))).toMatchObject({
      ok: false,
      code: 'ALREADY_EXISTS',
    });
    expect(run(null, ev('PROPOSE', ai, 'AI_AGENT', { amount_inr: -1 }))).toMatchObject({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
    expect(run(null, ev('PROPOSE', ai, 'AI_AGENT', { amount_inr: 1.5 }))).toMatchObject({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
    expect(run(null, ev('PROPOSE', ai, 'AI_AGENT'))).toMatchObject({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
  });
  it('every other event on a missing item is NOT_FOUND', () => {
    for (const t of ['VALIDATE', 'AUTHORISE', 'REJECT', 'MODIFY'] as const)
      expect(run(null, ev(t, 'x', 'CFO'))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('VALIDATE (level 2)', () => {
  it('moves PROPOSED to BUSINESS_VALIDATED and records the validator', () => {
    expect(run(base(), ev('VALIDATE', 'vera', 'FINANCE_BUSINESS_PARTNER'))).toMatchObject({
      ok: true,
      state: { status: 'BUSINESS_VALIDATED', validated_by: 'vera' },
      logged: { from_state: 'PROPOSED', to_state: 'BUSINESS_VALIDATED', revision: 1 },
    });
    expect(run(base(), ev('VALIDATE', 'vera', 'FINANCE_MANAGER'))).toMatchObject({ ok: true });
  });
  it('is refused for the wrong roles', () => {
    for (const role of ['CFO', 'CONTROLLER', 'BUSINESS_OWNER', 'VIEWER', 'AI_AGENT'] as const)
      expect(run(base(), ev('VALIDATE', 'zed', role))).toMatchObject({
        ok: false,
        code: 'ROLE_NOT_PERMITTED',
      });
  });
  it('enforces segregation: the requester and the modifier cannot validate', () => {
    expect(run(base(), ev('VALIDATE', 'rita', 'FINANCE_MANAGER'))).toMatchObject({
      ok: false,
      code: 'SEGREGATION_OF_DUTIES',
    });
    expect(run(base({ modified_by: 'mo' }), ev('VALIDATE', 'mo', 'FINANCE_MANAGER'))).toMatchObject(
      { ok: false, code: 'SEGREGATION_OF_DUTIES' },
    );
    expect(
      run(base({ proposed_by: 'pat' }), ev('VALIDATE', 'pat', 'FINANCE_MANAGER')),
    ).toMatchObject({ ok: false, code: 'SEGREGATION_OF_DUTIES' });
  });
  it('cannot validate twice or from other states', () => {
    expect(
      run(
        base({ status: 'BUSINESS_VALIDATED', validated_by: 'vera' }),
        ev('VALIDATE', 'vic', 'FINANCE_MANAGER'),
      ),
    ).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
  });
});

describe('AUTHORISE (level 3)', () => {
  const validated = (o: Partial<RecState> = {}) =>
    base({ status: 'BUSINESS_VALIDATED', validated_by: 'vera', ...o });
  it('moves to AUTHORISED for a controller within the limit and for the CFO', () => {
    expect(run(validated(), ev('AUTHORISE', 'carl', 'CONTROLLER'))).toMatchObject({
      ok: true,
      state: { status: 'AUTHORISED' },
      logged: { to_state: 'AUTHORISED' },
    });
    expect(run(validated(), ev('AUTHORISE', 'cleo', 'CFO'))).toMatchObject({ ok: true });
  });
  it('cannot skip level 2', () => {
    expect(run(base(), ev('AUTHORISE', 'cleo', 'CFO'))).toMatchObject({
      ok: false,
      code: 'INVALID_TRANSITION',
    });
  });
  it('is refused for non-authorising roles', () => {
    for (const role of [
      'FINANCE_MANAGER',
      'FINANCE_BUSINESS_PARTNER',
      'BUSINESS_OWNER',
      'VIEWER',
      'AI_AGENT',
    ] as const)
      expect(run(validated(), ev('AUTHORISE', 'zed', role))).toMatchObject({
        ok: false,
        code: 'ROLE_NOT_PERMITTED',
      });
  });
  it('enforces segregation against everyone who touched the item', () => {
    for (const who of ['rita', 'vera', 'mo', 'pat']) {
      const s = validated({ modified_by: 'mo', proposed_by: 'pat' });
      expect(run(s, ev('AUTHORISE', who, 'CFO')), who).toMatchObject({
        ok: false,
        code: 'SEGREGATION_OF_DUTIES',
      });
    }
  });
  it('applies the delegation limit: above it only the CFO may authorise', () => {
    const big = validated({ amount_inr: DEFAULT_CONFIG.controllerLimitInr + 1 });
    expect(run(big, ev('AUTHORISE', 'carl', 'CONTROLLER'))).toMatchObject({
      ok: false,
      code: 'DELEGATION_LIMIT',
    });
    expect(run(big, ev('AUTHORISE', 'cleo', 'CFO'))).toMatchObject({ ok: true });
    expect(
      run(
        validated({ amount_inr: DEFAULT_CONFIG.controllerLimitInr }),
        ev('AUTHORISE', 'carl', 'CONTROLLER'),
      ),
    ).toMatchObject({ ok: true });
  });
  it('honours a custom limit', () => {
    expect(
      applyEvent(validated(), ev('AUTHORISE', 'carl', 'CONTROLLER'), 'R1', {
        ...DEFAULT_CONFIG,
        controllerLimitInr: 1,
      }),
    ).toMatchObject({ ok: false, code: 'DELEGATION_LIMIT' });
  });
});

describe('REJECT and MODIFY (human override)', () => {
  const why = 'Customer has not confirmed the new delivery dates';
  it('rejects from PROPOSED or BUSINESS_VALIDATED with a justification', () => {
    expect(
      run(base(), ev('REJECT', 'vera', 'FINANCE_MANAGER', { justification: why })),
    ).toMatchObject({ ok: true, state: { status: 'REJECTED' }, logged: { justification: why } });
    expect(
      run(
        base({ status: 'BUSINESS_VALIDATED' }),
        ev('REJECT', 'cleo', 'CFO', { justification: why }),
      ),
    ).toMatchObject({ ok: true });
  });
  it('requires a real justification, not whitespace or a few characters', () => {
    for (const j of [undefined, null, '', '   ', 'no', '         x '])
      expect(
        run(base(), ev('REJECT', 'vera', 'FINANCE_MANAGER', { justification: j })),
      ).toMatchObject({ ok: false, code: 'JUSTIFICATION_REQUIRED' });
  });
  it('limits who may reject or modify', () => {
    for (const role of ['BUSINESS_OWNER', 'VIEWER', 'AI_AGENT'] as const) {
      expect(run(base(), ev('REJECT', 'zed', role, { justification: why }))).toMatchObject({
        ok: false,
        code: 'ROLE_NOT_PERMITTED',
      });
      expect(
        run(base(), ev('MODIFY', 'zed', role, { justification: why, amount_inr: 1 })),
      ).toMatchObject({ ok: false, code: 'ROLE_NOT_PERMITTED' });
    }
  });
  it('modify starts a new revision, returns to PROPOSED, clears the validation and bars the modifier', () => {
    const r = run(
      base({ status: 'BUSINESS_VALIDATED', validated_by: 'vera' }),
      ev('MODIFY', 'mo', 'FINANCE_MANAGER', { justification: why, amount_inr: 7_000_000 }),
    );
    expect(r).toMatchObject({
      ok: true,
      state: {
        status: 'PROPOSED',
        revision: 2,
        amount_inr: 7_000_000,
        validated_by: null,
        modified_by: 'mo',
      },
      logged: {
        revision: 2,
        from_state: 'BUSINESS_VALIDATED',
        to_state: 'PROPOSED',
        amount_inr: 7_000_000,
      },
    });
    if (r.ok)
      expect(run(r.state, ev('VALIDATE', 'mo', 'FINANCE_MANAGER'))).toMatchObject({
        ok: false,
        code: 'SEGREGATION_OF_DUTIES',
      });
  });
  it('modify validates the amount and the justification', () => {
    expect(
      run(base(), ev('MODIFY', 'mo', 'FINANCE_MANAGER', { justification: why, amount_inr: -5 })),
    ).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(
      run(base(), ev('MODIFY', 'mo', 'FINANCE_MANAGER', { justification: why })),
    ).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(run(base(), ev('MODIFY', 'mo', 'FINANCE_MANAGER', { amount_inr: 5 }))).toMatchObject({
      ok: false,
      code: 'JUSTIFICATION_REQUIRED',
    });
  });
});

describe('terminal states and unknown events', () => {
  it('accepts nothing after AUTHORISED or REJECTED', () => {
    for (const status of ['AUTHORISED', 'REJECTED'] as const) {
      for (const t of ['VALIDATE', 'AUTHORISE', 'REJECT', 'MODIFY'] as const) {
        expect(
          run(
            base({ status }),
            ev(t, 'cleo', 'CFO', { justification: 'long enough reason', amount_inr: 1 }),
          ),
        ).toMatchObject({ ok: false, code: 'TERMINAL_STATE' });
      }
    }
  });
  it('refuses an unknown event type', () => {
    expect(run(base(), ev('HACK' as never, 'cleo', 'CFO'))).toMatchObject({
      ok: false,
      code: 'INVALID_TRANSITION',
    });
  });
  it('does not mutate the state it is given', () => {
    const s = base();
    const copy = JSON.stringify(s);
    run(s, ev('VALIDATE', 'vera', 'FINANCE_MANAGER'));
    expect(JSON.stringify(s)).toBe(copy);
  });
});
