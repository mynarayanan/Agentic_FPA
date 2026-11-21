import { scenarioPayload } from '@fpa/db';
import { getDb, noDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const db = getDb();
  if (!db) return noDb();
  const q = new URL(req.url).searchParams;
  try {
    const { status, body } = await scenarioPayload(db, {
      volume: q.get('volume'),
      price: q.get('price'),
      material_cost: q.get('material_cost'),
      opex: q.get('opex'),
    });
    return Response.json(body, { status });
  } catch (err) {
    console.error('scenario route failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
