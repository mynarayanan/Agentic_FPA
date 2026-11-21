import { listPayload } from '@fpa/db';
import { getDb, noDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const db = getDb();
  if (!db) return noDb();
  try {
    const { status, body } = await listPayload(db, {
      period: new URL(req.url).searchParams.get('period'),
    });
    return Response.json(body, { status });
  } catch (err) {
    console.error('recommendations list failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
