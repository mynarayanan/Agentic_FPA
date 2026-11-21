import { eventPayload } from '@fpa/db';
import { requireWriteToken } from '../../../../../lib/auth';
import { getTxDb, noDb, now, readJson } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const refused = requireWriteToken(req);
  if (refused) return refused;
  const db = getTxDb();
  if (!db) return noDb();
  try {
    const { id } = await ctx.params;
    const { status, body } = await eventPayload(db, id, await readJson(req), now);
    return Response.json(body, { status });
  } catch (err) {
    console.error('approval event failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
