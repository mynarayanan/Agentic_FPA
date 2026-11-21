import type { Db } from './client';
import { varianceReport } from './queries';
import { DEFAULT_CONFIG, ROLES } from '@fpa/audit';
import type { ErrorCode, Role } from '@fpa/audit';
import { z } from 'zod';

export interface ApiResult {
  status: number;
  body: unknown;
}

/** Framework-free handler logic for GET /api/variance, so it can be tested without Next.js. */
export async function variancePayload(
  db: Db,
  query: { period?: string | null; entity?: string | null },
): Promise<ApiResult> {
  const period = query.period || '2026-11';
  const entity = query.entity || undefined;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    return { status: 400, body: { error: 'period must look like 2026-11' } };
  if (entity !== undefined && !/^E-[A-Z]{2}$/.test(entity))
    return { status: 400, body: { error: 'entity must look like E-IN' } };
  const report = await varianceReport(db, { period, entity });
  if (!report)
    return {
      status: 404,
      body: {
        error: `no actual and budget data for period ${period}${entity ? ` and entity ${entity}` : ''}`,
      },
    };
  return { status: 200, body: report };
}

// ---------------------------------------------------------------------------------------------
// Recommendations and approvals
// ---------------------------------------------------------------------------------------------
import {
  generateRecommendations,
  getRecommendation,
  listRecommendations,
  recordEvent,
  verifyAudit,
  view,
} from './recommendations';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const PERSON = /^[A-Za-z0-9_.@-]{2,64}$/;
const ID = /^AI-INS-\d{5}$/;

const STATUS_FOR: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  TERMINAL_STATE: 409,
  INVALID_TRANSITION: 409,
  ROLE_NOT_PERMITTED: 403,
  SEGREGATION_OF_DUTIES: 403,
  DELEGATION_LIMIT: 403,
  JUSTIFICATION_REQUIRED: 422,
  INVALID_AMOUNT: 422,
  AUDIT_CORRUPT: 500,
};

const bad = (message: string): ApiResult => ({ status: 400, body: { error: message } });

/** GET /api/recommendations?period= */
export async function listPayload(db: Db, query: { period?: string | null }): Promise<ApiResult> {
  const period = query.period || undefined;
  if (period !== undefined && !PERIOD.test(period)) return bad('period must look like 2026-11');
  const rows = await listRecommendations(db, { period });
  const views = rows.map((r) => view(r, DEFAULT_CONFIG));
  const net = rows.reduce(
    (s, r) =>
      s + ((r.assessment as { net_in_year_profit_inr?: number }).net_in_year_profit_inr ?? 0),
    0,
  );
  return {
    status: 200,
    body: {
      period: period ?? null,
      count: views.length,
      net_in_year_profit_inr: net,
      recommendations: views,
    },
  };
}

/** POST /api/recommendations/generate  { period?, requested_by } */
export async function generatePayload(
  db: Db,
  body: unknown,
  now: () => string,
): Promise<ApiResult> {
  const parsed = z
    .object({ period: z.string().regex(PERIOD).optional(), requested_by: z.string().regex(PERSON) })
    .strict()
    .safeParse(body);
  if (!parsed.success) return bad('body must be { period?: "2026-11", requested_by: "<your id>" }');
  if (parsed.data.requested_by.startsWith('ai:'))
    return bad('requested_by must be a human user id');
  const period = parsed.data.period ?? '2026-11';
  const result = await generateRecommendations(db, {
    period,
    requestedBy: parsed.data.requested_by,
    now: now(),
  });
  if (!result)
    return { status: 404, body: { error: `no actual and budget data for period ${period}` } };
  return {
    status: result.created.length > 0 ? 201 : 200,
    body: {
      period,
      created: result.created,
      existing: result.existing,
      portfolio: result.portfolio,
    },
  };
}

/** GET /api/recommendations/:id */
export async function detailPayload(db: Db, id: string): Promise<ApiResult> {
  if (!ID.test(id)) return bad('id must look like AI-INS-00001');
  const d = await getRecommendation(db, id);
  if (!d) return { status: 404, body: { error: `${id} does not exist` } };
  return {
    status: 200,
    body: {
      recommendation: view(d.recommendation, DEFAULT_CONFIG),
      events: d.events,
      chain: d.chain,
      state_matches_log: d.state_matches_log,
    },
  };
}

const eventBody = z
  .object({
    type: z.enum(['VALIDATE', 'AUTHORISE', 'REJECT', 'MODIFY']),
    actor_id: z.string().regex(PERSON),
    actor_role: z.enum(ROLES as [Role, ...Role[]]),
    justification: z.string().max(2000).optional(),
    amount_inr: z.number().int().nonnegative().optional(),
  })
  .strict();

/** POST /api/recommendations/:id/events  { type, actor_id, actor_role, justification?, amount_inr? } */
export async function eventPayload(
  db: Db,
  id: string,
  body: unknown,
  now: () => string,
): Promise<ApiResult> {
  if (!ID.test(id)) return bad('id must look like AI-INS-00001');
  const p = eventBody.safeParse(body);
  if (!p.success)
    return bad(
      'body must be { type: VALIDATE|AUTHORISE|REJECT|MODIFY, actor_id, actor_role, justification?, amount_inr? }',
    );
  if (p.data.actor_role === 'AI_AGENT' || p.data.actor_id.startsWith('ai:'))
    return bad('the AI agent cannot take approval actions');
  const r = await recordEvent(db, id, {
    type: p.data.type,
    actor: { id: p.data.actor_id, role: p.data.actor_role },
    at: now(),
    justification: p.data.justification,
    amount_inr: p.data.amount_inr,
  });
  if (!r.ok) return { status: STATUS_FOR[r.code], body: { error: r.message, code: r.code } };
  return {
    status: 200,
    body: { recommendation: view(r.recommendation, DEFAULT_CONFIG), event: r.event },
  };
}

/** GET /api/audit/verify */
export async function auditPayload(db: Db): Promise<ApiResult> {
  const report = await verifyAudit(db);
  return { status: report.ok ? 200 : 500, body: report };
}

// ---------------------------------------------------------------------------------------------
// Forecast and scenario
// ---------------------------------------------------------------------------------------------
import { forecastData, scenarioFor } from './forecast';

/** GET /api/forecast */
export async function forecastPayload(db: Db): Promise<ApiResult> {
  return { status: 200, body: await forecastData(db) };
}

const pct = (raw: string | null | undefined, name: string): number | string => {
  if (raw === null || raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > 50)
    return `${name} must be a number between -50 and 50 (percent)`;
  return Math.round(n * 100);
};

/** GET /api/scenario?volume=-5&price=0&material_cost=3&opex=0   (percentages; absent means 0) */
export async function scenarioPayload(
  db: Db,
  q: {
    volume?: string | null;
    price?: string | null;
    material_cost?: string | null;
    opex?: string | null;
  },
): Promise<ApiResult> {
  const parsed = {
    volume_bps: pct(q.volume, 'volume'),
    price_bps: pct(q.price, 'price'),
    material_cost_bps: pct(q.material_cost, 'material_cost'),
    opex_bps: pct(q.opex, 'opex'),
  };
  const err = Object.values(parsed).find((v) => typeof v === 'string');
  if (err) return bad(err as string);
  return {
    status: 200,
    body: await scenarioFor(
      db,
      parsed as {
        volume_bps: number;
        price_bps: number;
        material_cost_bps: number;
        opex_bps: number;
      },
    ),
  };
}
