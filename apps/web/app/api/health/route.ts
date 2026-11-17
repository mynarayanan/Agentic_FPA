import { ENGINE_VERSION } from '@fpa/engine';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', engine: ENGINE_VERSION });
}
