import { auditPayload } from '@fpa/db';
import { getDb, noDb } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  if (!db) return noDb();
  try {
    const { status, body } = await auditPayload(db);
    return Response.json(body, { status });
  } catch (err) {
    console.error('audit verify failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
