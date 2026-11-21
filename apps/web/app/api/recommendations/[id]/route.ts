import { detailPayload } from '@fpa/db';
import { getDb, noDb } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const db = getDb();
  if (!db) return noDb();
  try {
    const { id } = await ctx.params;
    const { status, body } = await detailPayload(db, id);
    return Response.json(body, { status });
  } catch (err) {
    console.error('recommendation detail failed', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
