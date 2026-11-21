import { forecastPayload } from '@fpa/db';
import { getDb, noDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  if (!db) return noDb();
  try {
    const { status, body } = await forecastPayload(db);
    return Response.json(body, { status });
  } catch (err) {
    console.error('forecast route failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
