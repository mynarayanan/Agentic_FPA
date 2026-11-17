import type { Db } from './client';
import { varianceReport } from './queries';

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
