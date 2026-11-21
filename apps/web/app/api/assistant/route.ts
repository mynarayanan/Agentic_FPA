import { variancePayload } from '@fpa/db';
import type { VarianceReport } from '@fpa/engine';
import {
  REDIRECTS,
  anthropicClient,
  buildFactSheet,
  cleanQuestion,
  generateNarrative,
  topicOf,
} from '@fpa/narrative';
import { hasValidToken } from '../../../lib/auth';
import { getDb, noDb, readJson } from '../../../lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST { question, period?, entity? }. The topic is chosen by keyword rules, never by a model. Variance
 * questions get a guarded narrative; others get a pointer to the screen that answers them. The model
 * is used only when the request carries the write token, so an open URL cannot spend model tokens.
 */
export async function POST(req: Request) {
  const db = getDb();
  if (!db) return noDb();
  const body = (await readJson(req)) as {
    question?: unknown;
    period?: unknown;
    entity?: unknown;
  } | null;
  const question = cleanQuestion(typeof body?.question === 'string' ? body.question : null);
  if (!question)
    return Response.json({ error: 'body must be { question: "..." }' }, { status: 400 });
  const topic = topicOf(question);
  const redirect = REDIRECTS[topic];
  if (redirect) return Response.json({ question, topic, redirect, answer: null });
  try {
    const { status, body: report } = await variancePayload(db, {
      period: typeof body?.period === 'string' ? body.period : null,
      entity: typeof body?.entity === 'string' ? body.entity : null,
    });
    if (status !== 200) return Response.json(report, { status });
    const key = process.env.ANTHROPIC_API_KEY;
    const llm =
      key && hasValidToken(req)
        ? anthropicClient({ apiKey: key, model: process.env.ANTHROPIC_MODEL || undefined })
        : null;
    const answer = await generateNarrative(llm, report as VarianceReport, { question });
    return Response.json({
      question,
      topic,
      redirect: null,
      answer,
      facts: buildFactSheet(report as VarianceReport).facts,
      calc_refs: (report as VarianceReport).calc_refs,
    });
  } catch (err) {
    console.error('assistant route failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
