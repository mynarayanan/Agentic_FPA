import { generatePayload } from '@fpa/db';
import { requireWriteToken } from '../../../../lib/auth';
import { getTxDb, noDb, now, readJson } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const refused = requireWriteToken(req);
  if (refused) return refused;
  const db = getTxDb();
  if (!db) return noDb();
  try {
    const { status, body } = await generatePayload(db, await readJson(req), now);
    return Response.json(body, { status });
  } catch (err) {
    console.error('generate failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
