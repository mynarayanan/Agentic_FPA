import { variancePayload } from '@fpa/db';
import type { VarianceReport } from '@fpa/engine';
import { anthropicClient, buildFactSheet, generateNarrative } from '@fpa/narrative';
import { hasValidToken } from '../../../lib/auth';
import { getDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';
// Model calls can take several seconds; Vercel's default function limit may be shorter than that.
export const maxDuration = 30;

export async function GET(req: Request) {
  const db = getDb();
  if (!db) return Response.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const q = new URL(req.url).searchParams;
  try {
    const { status, body } = await variancePayload(db, {
      period: q.get('period'),
      entity: q.get('entity'),
    });
    if (status !== 200) return Response.json(body, { status });
    const report = body as VarianceReport;
    // Without a key the endpoint still works: it returns the deterministic template narrative.
    const key = process.env.ANTHROPIC_API_KEY;
    // The model is used only for callers holding the write token, so an open URL cannot spend model tokens.
    const llm =
      key && hasValidToken(req)
        ? anthropicClient({ apiKey: key, model: process.env.ANTHROPIC_MODEL || undefined })
        : null;
    const narrative = await generateNarrative(llm, report);
    return Response.json({
      period: report.period,
      entity_id: report.entity_id,
      narrative,
      facts: buildFactSheet(report).facts,
      calc_refs: report.calc_refs,
    });
  } catch (err) {
    console.error('narrative route failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
