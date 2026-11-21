import { timingSafeEqual } from 'node:crypto';

/**
 * Write endpoints are disabled unless API_WRITE_TOKEN is set, and then require `Authorization: Bearer <token>`.
 * POC limitation: this protects the endpoint, but the acting person and role in the request body are
 * ASSERTED by the caller, not authenticated (no SSO yet). Segregation of duties is only as strong as that identity.
 * Returns a Response to send back if the request must be refused, or null if it may proceed.
 */
/** True when a write token is configured and the request carries it. Used to gate costly or privileged features. */
export function hasValidToken(req: Request): boolean {
  const expected = process.env.API_WRITE_TOKEN;
  if (!expected) return false;
  const given = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireWriteToken(req: Request): Response | null {
  if (!process.env.API_WRITE_TOKEN)
    return Response.json(
      { error: 'writes are disabled: API_WRITE_TOKEN is not set' },
      { status: 503 },
    );
  return hasValidToken(req)
    ? null
    : Response.json({ error: 'missing or invalid bearer token' }, { status: 401 });
}
