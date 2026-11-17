import { variancePayload } from '@fpa/db';
import { getDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const db = getDb();
  if (!db) return Response.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const q = new URL(req.url).searchParams;
  try {
    const { status, body } = await variancePayload(db, {
      period: q.get('period'),
      entity: q.get('entity'),
    });
    return Response.json(body, { status });
  } catch (err) {
    console.error('variance route failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
