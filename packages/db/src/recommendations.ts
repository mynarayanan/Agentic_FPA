import { createHash } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { appendEvent, replay, verifyChain } from '@fpa/audit';
import type { ApprovalEvent, ChainCheck, Config, Failure, LoggedEvent, RecState } from '@fpa/audit';
import { DEFAULT_ASSESSMENT_PARAMS, assessActions, calcRegistry } from '@fpa/engine';
import type { ActionInput, PortfolioAssessment } from '@fpa/engine';
import { rowsOf } from './client';
import type { Db } from './client';
import { collectEvidence } from './evidence';
import type { EvidenceItem } from './evidence';
import { varianceReport } from './queries';
import { approvalEvent, dimAction, recommendation } from './schema';

export const AI_AGENT_ID = 'ai:fpa-agent';
export const SCOPE_GROUP = 'GROUP';

export type RecommendationRow = typeof recommendation.$inferSelect;
export type EventRow = typeof approvalEvent.$inferSelect;

export interface RecommendationView {
  id: string;
  period: string;
  scope: string;
  action_id: string;
  title: string;
  owner_role: string;
  status: string;
  revision: number;
  amount_inr: number;
  proposed_by: string;
  requested_by: string | null;
  assessment: unknown;
  evidence: EvidenceItem[];
  source: unknown;
  created_at: string;
  /** What has to happen next, so a UI can show who is on the hook. */
  awaiting: string;
}

export const toEvents = (rows: EventRow[]): LoggedEvent[] =>
  rows.map(
    (r) =>
      ({
        ...r,
        type: r.type,
        actor_role: r.actor_role,
        from_state: r.from_state,
        to_state: r.to_state,
      }) as LoggedEvent,
  );

export function awaiting(
  status: string,
  amount: number,
  cfg: Pick<Config, 'controllerLimitInr'>,
): string {
  if (status === 'PROPOSED') return 'validation by a finance business partner or finance manager';
  if (status === 'BUSINESS_VALIDATED')
    return amount > cfg.controllerLimitInr
      ? 'authorisation by the CFO'
      : 'authorisation by a controller or the CFO';
  return status === 'AUTHORISED'
    ? 'nothing: authorised for the official EPM process'
    : 'nothing: rejected';
}

export function view(
  r: RecommendationRow,
  cfg: Pick<Config, 'controllerLimitInr'>,
): RecommendationView {
  return {
    ...r,
    evidence: r.evidence as EvidenceItem[],
    awaiting: awaiting(r.status, r.amount_inr, cfg),
  };
}

export interface GenerateResult {
  created: string[];
  existing: string[];
  portfolio: PortfolioAssessment;
}

/**
 * Assess the action library against a period's variance and file one recommendation per action, each
 * with a PROPOSE event from the AI agent. Idempotent: an action already filed for the period is returned, not duplicated.
 */
export async function generateRecommendations(
  db: Db,
  opts: {
    period: string;
    requestedBy: string;
    now: string;
    amountParams?: typeof DEFAULT_ASSESSMENT_PARAMS;
  },
): Promise<GenerateResult | null> {
  const report = await varianceReport(db, { period: opts.period });
  if (!report) return null;
  const [fy] = rowsOf<{ fy_end: string }>(
    await db.execute(
      sql`select max(period) as fy_end from dim_period where fiscal_year = (select fiscal_year from dim_period where period = ${opts.period})`,
    ),
  );
  const fyEnd = fy?.fy_end as string;
  const actions = (await db.select().from(dimAction)) as unknown as Array<
    ActionInput & { owner_role: string }
  >;
  const params = {
    ...(opts.amountParams ?? DEFAULT_ASSESSMENT_PARAMS),
    decisionPeriod: opts.period,
    fyEndPeriod: fyEnd,
  };
  const portfolio = assessActions(actions, report.pnl.operatingProfit.variance, params);
  const evidence = await collectEvidence(db, report, fyEnd);
  const source = {
    report_hash: createHash('sha256')
      .update(
        JSON.stringify({
          pnl: report.pnl,
          accounts: report.accounts,
          bridge: report.revenue_bridge,
        }),
      )
      .digest('hex'),
    calc_refs: [
      ...report.calc_refs,
      ...calcRegistry
        .filter((c) => c.id === 'ACT-IMP-001')
        .map((c) => ({ id: c.id, version: c.version })),
    ],
    params,
    actual_version: report.actual_version,
    budget_version: report.budget_version,
  };

  const created: string[] = [];
  const existing: string[] = [];
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table recommendation in share row exclusive mode`);
    let [{ n }] = rowsOf<{ n: string }>(
      await tx.execute(sql`select count(*)::text as n from recommendation`),
    ).map((r) => ({ n: r.n })) as [{ n: string }];
    for (const a of portfolio.actions) {
      const found = await tx
        .select({ id: recommendation.id })
        .from(recommendation)
        .where(
          and(
            eq(recommendation.period, opts.period),
            eq(recommendation.scope, SCOPE_GROUP),
            eq(recommendation.action_id, a.action_id),
          ),
        );
      if (found[0]) {
        existing.push(found[0].id);
        continue;
      }
      n = String(Number(n) + 1);
      const id = `AI-INS-${n.padStart(5, '0')}`;
      const ev: ApprovalEvent = {
        type: 'PROPOSE',
        actor: { id: AI_AGENT_ID, role: 'AI_AGENT' },
        at: opts.now,
        amount_inr: a.gross_inr,
        requested_by: opts.requestedBy,
      };
      const r = appendEvent([], ev, id);
      if (!r.ok) throw new Error(`could not propose ${id}: ${r.message}`);
      const meta = actions.find((x) => x.action_id === a.action_id) as ActionInput & {
        owner_role: string;
      };
      await tx.insert(recommendation).values({
        id,
        period: opts.period,
        scope: SCOPE_GROUP,
        action_id: a.action_id,
        title: a.title,
        owner_role: meta.owner_role,
        status: r.state.status,
        revision: r.state.revision,
        amount_inr: r.state.amount_inr,
        proposed_by: AI_AGENT_ID,
        requested_by: opts.requestedBy,
        assessment: a,
        evidence: evidence[a.action_id] ?? [],
        source,
        created_at: opts.now,
      });
      await tx.insert(approvalEvent).values(r.event);
      created.push(id);
    }
  });
  return { created, existing, portfolio };
}

export async function listRecommendations(
  db: Db,
  opts: { period?: string } = {},
): Promise<RecommendationRow[]> {
  const rows = await db
    .select()
    .from(recommendation)
    .where(opts.period ? eq(recommendation.period, opts.period) : undefined)
    .orderBy(asc(recommendation.id));
  return rows;
}

export interface Detail {
  recommendation: RecommendationRow;
  events: EventRow[];
  chain: ChainCheck;
  /** The stored status equals the state obtained by replaying the log. */
  state_matches_log: boolean;
}

export async function getRecommendation(db: Db, id: string): Promise<Detail | null> {
  const [rec] = await db.select().from(recommendation).where(eq(recommendation.id, id));
  if (!rec) return null;
  const events = await db
    .select()
    .from(approvalEvent)
    .where(eq(approvalEvent.recommendation_id, id))
    .orderBy(asc(approvalEvent.n));
  return {
    recommendation: rec,
    events,
    chain: verifyChain(toEvents(events)),
    state_matches_log: matches(rec, replay(toEvents(events))),
  };
}

function matches(rec: RecommendationRow, r: ReturnType<typeof replay>): boolean {
  return (
    r.ok &&
    r.state !== null &&
    r.state.status === rec.status &&
    r.state.revision === rec.revision &&
    r.state.amount_inr === rec.amount_inr
  );
}

export type EventResult =
  { ok: true; recommendation: RecommendationRow; event: LoggedEvent } | Failure;

/** Apply one approval event atomically: lock the item, replay its log, validate the rules, append, update. */
export async function recordEvent(
  db: Db,
  id: string,
  ev: ApprovalEvent,
  cfg?: Config,
): Promise<EventResult> {
  return db.transaction(async (tx): Promise<EventResult> => {
    const [rec] = await tx
      .select()
      .from(recommendation)
      .where(eq(recommendation.id, id))
      .for('update');
    if (!rec) return { ok: false, code: 'NOT_FOUND', message: `${id} does not exist` };
    const events = await tx
      .select()
      .from(approvalEvent)
      .where(eq(approvalEvent.recommendation_id, id))
      .orderBy(asc(approvalEvent.n));
    const r = appendEvent(toEvents(events), ev, id, cfg);
    if (!r.ok) return r;
    await tx.insert(approvalEvent).values(r.event);
    const state: RecState = r.state;
    const [updated] = await tx
      .update(recommendation)
      .set({ status: state.status, revision: state.revision, amount_inr: state.amount_inr })
      .where(eq(recommendation.id, id))
      .returning();
    return { ok: true, recommendation: updated as RecommendationRow, event: r.event };
  });
}

export interface AuditReport {
  ok: boolean;
  recommendations: number;
  events: number;
  problems: Array<{ recommendation_id: string; problem: string }>;
}

/** Check every chain and that every stored status equals what its log replays to. */
export async function verifyAudit(db: Db): Promise<AuditReport> {
  const recs = await db.select().from(recommendation).orderBy(asc(recommendation.id));
  const all = await db
    .select()
    .from(approvalEvent)
    .orderBy(asc(approvalEvent.recommendation_id), asc(approvalEvent.n));
  const problems: AuditReport['problems'] = [];
  for (const rec of recs) {
    const events = toEvents(all.filter((e) => e.recommendation_id === rec.id));
    const chain = verifyChain(events);
    if (!chain.ok)
      problems.push({
        recommendation_id: rec.id,
        problem: `chain broken at entry ${chain.brokenAt}: ${chain.reason}`,
      });
    else if (events.length === 0)
      problems.push({ recommendation_id: rec.id, problem: 'recommendation has no events' });
    else {
      const r = replay(events);
      if (!r.ok) problems.push({ recommendation_id: rec.id, problem: r.message });
      else if (!matches(rec, r))
        problems.push({
          recommendation_id: rec.id,
          problem: 'stored status does not match the log',
        });
    }
  }
  return { ok: problems.length === 0, recommendations: recs.length, events: all.length, problems };
}

/** DEV AND TEST ONLY. Wipes the decision log, bypassing the append-only triggers. Never exposed over HTTP. */
export async function resetAuditLog(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`alter table approval_event disable trigger user`);
    await tx.execute(sql`truncate table approval_event, recommendation`);
    await tx.execute(sql`alter table approval_event enable trigger user`);
  });
}
