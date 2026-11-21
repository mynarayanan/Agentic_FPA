import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { join } from 'node:path';
import {
  auditPayload,
  detailPayload,
  eventPayload,
  generatePayload,
  listPayload,
  loadTables,
  resetAuditLog,
  rowsOf,
} from '../src';
import type { Db } from '../src';
import { readFixtures } from '../src/node';
import { createTestDb } from '../src/testing';

const CR = 10_000_000;
let db: Db;
let close: () => Promise<void>;
let tick = 0;
const now = () =>
  `2026-11-20T10:${String(Math.floor(tick / 60) % 60).padStart(2, '0')}:${String(tick++ % 60).padStart(2, '0')}.000Z`;
const WHY = 'Customer confirmed the revised delivery dates in writing';

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await loadTables(db, readFixtures(join(__dirname, '..', '..', '..', 'data')));
});
afterAll(async () => close());
beforeEach(async () => {
  await resetAuditLog(db);
  tick = 0;
});

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const generate = async (requested_by = 'rita') =>
  generatePayload(db, { period: '2026-11', requested_by }, now);
const act = (id: string, type: string, actor_id: string, actor_role: string, extra: Body = {}) =>
  eventPayload(db, id, { type, actor_id, actor_role, ...extra }, now);
const idFor = async (action: string): Promise<string> => {
  const list = (await listPayload(db, {})).body as Body;
  return list.recommendations.find((r: Body) => r.action_id === action).id;
};

describe('generating recommendations', () => {
  it('files one PROPOSED recommendation per action with the engine assessment, evidence and provenance', async () => {
    const res = await generate();
    expect(res.status).toBe(201);
    const body = res.body as Body;
    expect(body.created).toEqual(['AI-INS-00001', 'AI-INS-00002', 'AI-INS-00003', 'AI-INS-00004']);
    expect(body.portfolio.totals.gross_inr).toBe(14.3 * CR);
    expect(body.portfolio.totals.net_in_year_profit_inr).toBe(3.5 * CR);
    expect(body.portfolio.gap_inr).toBe(7 * CR);

    const list = (await listPayload(db, { period: '2026-11' })).body as Body;
    expect(list.count).toBe(4);
    expect(list.net_in_year_profit_inr).toBe(3.5 * CR);
    const a1 = list.recommendations.find((r: Body) => r.action_id === 'ACT-001');
    expect(a1).toMatchObject({
      status: 'PROPOSED',
      revision: 1,
      amount_inr: 10 * CR,
      proposed_by: 'ai:fpa-agent',
      requested_by: 'rita',
      owner_role: 'Regional Sales Director',
      scope: 'GROUP',
    });
    expect(a1.awaiting).toContain('validation');
    expect(a1.assessment).toMatchObject({ net_in_year_profit_inr: 2.27 * CR, incremental: false });
    expect(a1.source.calc_refs.map((c: Body) => c.id)).toContain('ACT-IMP-001');
    expect(a1.source.report_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a1.source.params).toMatchObject({ decisionPeriod: '2026-11', fyEndPeriod: '2027-03' });
  });
  it('attaches source-data evidence to each action', async () => {
    await generate();
    const list = (await listPayload(db, {})).body as Body;
    const ev = (action: string) =>
      list.recommendations.find((r: Body) => r.action_id === action).evidence;
    expect(ev('ACT-001')[0]).toMatchObject({
      value_inr: 15 * CR,
      count: 3,
      source: 'fact_order_book',
    });
    expect(ev('ACT-001')[1]).toMatchObject({ value_inr: 1 * CR, count: 3 });
    expect(ev('ACT-001')[2]).toMatchObject({ value_inr: -1 * CR });
    expect(ev('ACT-002')[0].value_inr).toBe(3 * CR); // 0.8 travel + 1.2 consulting + 1.0 contractors above budget
    expect(ev('ACT-002')[1].count).toBeGreaterThan(0);
    expect(ev('ACT-003')[1]).toMatchObject({ bps: 1200 });
    expect(ev('ACT-004')[0]).toMatchObject({ count: 5 });
  });
  it('is idempotent: a second call returns the same recommendations and creates nothing', async () => {
    await generate();
    const again = await generate('someone-else');
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({
      created: [],
      existing: ['AI-INS-00001', 'AI-INS-00002', 'AI-INS-00003', 'AI-INS-00004'],
    });
    expect(((await listPayload(db, {})).body as Body).count).toBe(4);
  });
  it('validates input and handles periods without data', async () => {
    expect((await generatePayload(db, {}, now)).status).toBe(400);
    expect((await generatePayload(db, { requested_by: 'ai:fpa-agent' }, now)).status).toBe(400);
    expect((await generatePayload(db, { requested_by: 'rita', period: 'nope' }, now)).status).toBe(
      400,
    );
    expect((await generatePayload(db, { requested_by: 'rita', extra: 1 }, now)).status).toBe(400);
    expect(
      (await generatePayload(db, { requested_by: 'rita', period: '2027-02' }, now)).status,
    ).toBe(404);
    expect(((await generatePayload(db, { requested_by: 'rita' }, now)).body as Body).period).toBe(
      '2026-11',
    );
  });
  it('lists nothing for another period and rejects a malformed one', async () => {
    await generate();
    expect(((await listPayload(db, { period: '2026-10' })).body as Body).count).toBe(0);
    expect((await listPayload(db, { period: 'x' })).status).toBe(400);
  });
});

describe('the three-level approval flow end to end', () => {
  it('validate by one person, authorise by another: the audit trail shows every step', async () => {
    await generate();
    const id = await idFor('ACT-002'); // 1.5 Cr, within the controller limit
    const v = await act(id, 'VALIDATE', 'vera', 'FINANCE_BUSINESS_PARTNER');
    expect(v.status).toBe(200);
    expect((v.body as Body).recommendation).toMatchObject({ status: 'BUSINESS_VALIDATED' });
    expect((v.body as Body).recommendation.awaiting).toContain('controller');
    const a = await act(id, 'AUTHORISE', 'carl', 'CONTROLLER');
    expect((a.body as Body).recommendation).toMatchObject({ status: 'AUTHORISED' });
    expect((a.body as Body).recommendation.awaiting).toContain('EPM');

    const d = (await detailPayload(db, id)).body as Body;
    expect(d.events.map((e: Body) => [e.n, e.type, e.actor_id, e.from_state, e.to_state])).toEqual([
      [1, 'PROPOSE', 'ai:fpa-agent', null, 'PROPOSED'],
      [2, 'VALIDATE', 'vera', 'PROPOSED', 'BUSINESS_VALIDATED'],
      [3, 'AUTHORISE', 'carl', 'BUSINESS_VALIDATED', 'AUTHORISED'],
    ]);
    expect(d.chain).toEqual({ ok: true });
    expect(d.state_matches_log).toBe(true);
    expect((await auditPayload(db)).body as Body).toMatchObject({
      ok: true,
      recommendations: 4,
      events: 6,
    });
  });
  it('enforces segregation of duties through the API', async () => {
    await generate('rita');
    const id = await idFor('ACT-002');
    expect(await act(id, 'VALIDATE', 'rita', 'FINANCE_MANAGER')).toMatchObject({
      status: 403,
      body: { code: 'SEGREGATION_OF_DUTIES' },
    });
    await act(id, 'VALIDATE', 'vera', 'FINANCE_MANAGER');
    expect(await act(id, 'AUTHORISE', 'vera', 'CONTROLLER')).toMatchObject({
      status: 403,
      body: { code: 'SEGREGATION_OF_DUTIES' },
    });
    expect(await act(id, 'AUTHORISE', 'rita', 'CFO')).toMatchObject({
      status: 403,
      body: { code: 'SEGREGATION_OF_DUTIES' },
    });
    expect(((await detailPayload(db, id)).body as Body).recommendation.status).toBe(
      'BUSINESS_VALIDATED',
    );
  });
  it('enforces roles and the delegation limit (10 Cr needs the CFO)', async () => {
    await generate();
    const big = await idFor('ACT-001');
    expect(await act(big, 'VALIDATE', 'cleo', 'CFO')).toMatchObject({
      status: 403,
      body: { code: 'ROLE_NOT_PERMITTED' },
    });
    await act(big, 'VALIDATE', 'vera', 'FINANCE_MANAGER');
    expect(await act(big, 'AUTHORISE', 'carl', 'CONTROLLER')).toMatchObject({
      status: 403,
      body: { code: 'DELEGATION_LIMIT' },
    });
    expect((await act(big, 'AUTHORISE', 'cleo', 'CFO')).status).toBe(200);
  });
  it('cannot skip validation, repeat a step, or act after a terminal state', async () => {
    await generate();
    const id = await idFor('ACT-004');
    expect(await act(id, 'AUTHORISE', 'cleo', 'CFO')).toMatchObject({
      status: 409,
      body: { code: 'INVALID_TRANSITION' },
    });
    await act(id, 'VALIDATE', 'vera', 'FINANCE_MANAGER');
    expect(await act(id, 'VALIDATE', 'vic', 'FINANCE_MANAGER')).toMatchObject({
      status: 409,
      body: { code: 'INVALID_TRANSITION' },
    });
    await act(id, 'AUTHORISE', 'carl', 'CONTROLLER');
    expect(await act(id, 'REJECT', 'cleo', 'CFO', { justification: WHY })).toMatchObject({
      status: 409,
      body: { code: 'TERMINAL_STATE' },
    });
  });
  it('rejection needs a real justification and is final', async () => {
    await generate();
    const id = await idFor('ACT-003');
    expect(await act(id, 'REJECT', 'vera', 'FINANCE_MANAGER')).toMatchObject({
      status: 422,
      body: { code: 'JUSTIFICATION_REQUIRED' },
    });
    expect(
      await act(id, 'REJECT', 'vera', 'FINANCE_MANAGER', { justification: 'no' }),
    ).toMatchObject({ status: 422 });
    const r = await act(id, 'REJECT', 'vera', 'FINANCE_MANAGER', {
      justification: 'Production capacity is fully booked until March',
    });
    expect((r.body as Body).recommendation).toMatchObject({ status: 'REJECTED' });
    expect(((await detailPayload(db, id)).body as Body).events[1].justification).toContain(
      'capacity',
    );
    expect((await act(id, 'VALIDATE', 'vic', 'FINANCE_MANAGER')).status).toBe(409);
  });
  it('modify starts a new revision, clears validation and bars the modifier from approving it', async () => {
    await generate();
    const id = await idFor('ACT-002');
    await act(id, 'VALIDATE', 'vera', 'FINANCE_MANAGER');
    const m = await act(id, 'MODIFY', 'mo', 'CONTROLLER', {
      amount_inr: 1 * CR,
      justification: 'Business owner expects only 1 Cr after reviewing contracts',
    });
    expect((m.body as Body).recommendation).toMatchObject({
      status: 'PROPOSED',
      revision: 2,
      amount_inr: 1 * CR,
    });
    expect(await act(id, 'VALIDATE', 'mo', 'FINANCE_MANAGER')).toMatchObject({
      status: 403,
      body: { code: 'SEGREGATION_OF_DUTIES' },
    });
    expect((await act(id, 'VALIDATE', 'vic', 'FINANCE_MANAGER')).status).toBe(200);
    expect(await act(id, 'MODIFY', 'mo', 'CONTROLLER', { justification: WHY })).toMatchObject({
      status: 422,
      body: { code: 'INVALID_AMOUNT' },
    });
    const d = (await detailPayload(db, id)).body as Body;
    expect(d.events.map((e: Body) => e.revision)).toEqual([1, 1, 2, 2]);
    expect(d.state_matches_log).toBe(true);
  });
  it('rejects malformed requests and unknown items', async () => {
    await generate();
    const id = await idFor('ACT-002');
    for (const body of [
      {},
      { type: 'PROPOSE', actor_id: 'vera', actor_role: 'FINANCE_MANAGER' },
      { type: 'VALIDATE', actor_id: 'x', actor_role: 'FINANCE_MANAGER' },
      { type: 'VALIDATE', actor_id: 'vera', actor_role: 'WIZARD' },
      { type: 'VALIDATE', actor_id: 'vera', actor_role: 'FINANCE_MANAGER', amount_inr: 1.5 },
      { type: 'VALIDATE', actor_id: 'vera', actor_role: 'FINANCE_MANAGER', hack: true },
    ]) {
      expect((await eventPayload(db, id, body, now)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await act(id, 'VALIDATE', 'ai:fpa-agent', 'FINANCE_MANAGER')).status).toBe(400);
    expect((await act(id, 'VALIDATE', 'vera', 'AI_AGENT')).status).toBe(400);
    expect((await eventPayload(db, 'bogus', {}, now)).status).toBe(400);
    expect((await detailPayload(db, 'bogus')).status).toBe(400);
    expect((await act('AI-INS-99999', 'VALIDATE', 'vera', 'FINANCE_MANAGER')).status).toBe(404);
    expect((await detailPayload(db, 'AI-INS-99999')).status).toBe(404);
  });
});

describe('the decision log is tamper-evident and append-only', () => {
  const flow = async () => {
    await generate();
    const id = await idFor('ACT-002');
    await act(id, 'VALIDATE', 'vera', 'FINANCE_MANAGER');
    return id;
  };
  it('the database itself refuses UPDATE, DELETE and TRUNCATE on the log', async () => {
    const id = await flow();
    await expect(
      db.execute(
        sql`update approval_event set actor_id = 'mallory' where recommendation_id = ${id}`,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.execute(sql`delete from approval_event where recommendation_id = ${id}`),
    ).rejects.toThrow(/append-only/);
    await expect(db.execute(sql`truncate table approval_event`)).rejects.toThrow(/append-only/);
    expect(((await detailPayload(db, id)).body as Body).events).toHaveLength(2);
  });
  it('reference-data reloads never touch the log', async () => {
    const id = await flow();
    await loadTables(db, readFixtures(join(__dirname, '..', '..', '..', 'data')));
    expect(((await detailPayload(db, id)).body as Body).events).toHaveLength(2);
    expect(((await auditPayload(db)).body as Body).ok).toBe(true);
  });
  it('detects an event rewritten by someone who bypassed the triggers, and refuses further approvals', async () => {
    const id = await flow();
    await db.execute(sql`alter table approval_event disable trigger user`);
    await db.execute(
      sql`update approval_event set actor_id = 'mallory' where recommendation_id = ${id} and n = 2`,
    );
    await db.execute(sql`alter table approval_event enable trigger user`);
    const audit = await auditPayload(db);
    expect(audit.status).toBe(500);
    expect((audit.body as Body).problems[0]).toMatchObject({ recommendation_id: id });
    expect((audit.body as Body).problems[0].problem).toContain('entry 2');
    expect(((await detailPayload(db, id)).body as Body).chain).toMatchObject({
      ok: false,
      brokenAt: 2,
    });
    expect(await act(id, 'AUTHORISE', 'carl', 'CONTROLLER')).toMatchObject({
      status: 500,
      body: { code: 'AUDIT_CORRUPT' },
    });
  });
  it('detects a status changed directly on the recommendation row, which the log does not support', async () => {
    const id = await flow();
    await db.execute(sql`update recommendation set status = 'AUTHORISED' where id = ${id}`);
    const audit = (await auditPayload(db)).body as Body;
    expect(audit.ok).toBe(false);
    expect(audit.problems[0].problem).toContain('does not match the log');
    expect(((await detailPayload(db, id)).body as Body).state_matches_log).toBe(false);
  });
  it('detects a deleted event (gap) and an item with no events', async () => {
    const id = await flow();
    await db.execute(sql`alter table approval_event disable trigger user`);
    await db.execute(sql`delete from approval_event where recommendation_id = ${id} and n = 1`);
    const gap = (await auditPayload(db)).body as Body;
    expect(gap.problems[0].problem).toContain('sequence');
    await db.execute(sql`delete from approval_event where recommendation_id = ${id}`);
    await db.execute(sql`alter table approval_event enable trigger user`);
    expect(((await auditPayload(db)).body as Body).problems[0].problem).toContain('no events');
  });
  it('an empty log verifies cleanly', async () => {
    expect((await auditPayload(db)).body as Body).toMatchObject({
      ok: true,
      recommendations: 0,
      events: 0,
    });
  });
  it('ids are assigned in sequence and never reused within a run', async () => {
    await generate();
    const ids = rowsOf<{ id: string }>(
      await db.execute(sql`select id from recommendation order by id`),
    ).map((r) => r.id);
    expect(ids).toEqual(['AI-INS-00001', 'AI-INS-00002', 'AI-INS-00003', 'AI-INS-00004']);
  });
});
