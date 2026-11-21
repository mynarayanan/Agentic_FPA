import { afterEach, describe, expect, it } from 'vitest';
import { POST as generate } from '../app/api/recommendations/generate/route';
import { POST as event } from '../app/api/recommendations/[id]/events/route';
import { POST as assistant } from '../app/api/assistant/route';
import { GET as scenario } from '../app/api/scenario/route';

const saved = { token: process.env.API_WRITE_TOKEN, db: process.env.DATABASE_URL };
afterEach(() => {
  for (const [k, v] of [
    ['API_WRITE_TOKEN', saved.token],
    ['DATABASE_URL', saved.db],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
const post = (body: unknown, auth?: string) =>
  new Request('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

describe('write routes check the token before anything else', () => {
  it('503 when writes are not enabled, 401 without or with the wrong token, never reaching the database', async () => {
    delete process.env.API_WRITE_TOKEN;
    delete process.env.DATABASE_URL;
    expect((await generate(post({ requested_by: 'rita' }))).status).toBe(503);
    process.env.API_WRITE_TOKEN = 'secret-token-value';
    expect((await generate(post({ requested_by: 'rita' }))).status).toBe(401);
    expect((await generate(post({ requested_by: 'rita' }, 'Bearer nope'))).status).toBe(401);
    const ctx = { params: Promise.resolve({ id: 'AI-INS-00001' }) };
    expect((await event(post({ type: 'VALIDATE' }), ctx)).status).toBe(401);
    expect((await event(post({ type: 'VALIDATE' }, 'Bearer nope'), ctx)).status).toBe(401);
  });
  it('with the right token but no database it explains what is missing', async () => {
    process.env.API_WRITE_TOKEN = 'secret-token-value';
    delete process.env.DATABASE_URL;
    const r = await generate(post({ requested_by: 'rita' }, 'Bearer secret-token-value'));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain('DATABASE_URL');
  });
});

describe('read routes without a database', () => {
  it('say so plainly instead of failing', async () => {
    delete process.env.DATABASE_URL;
    expect((await assistant(post({ question: 'why?' }))).status).toBe(503);
    expect((await scenario(new Request('http://x/api/scenario'))).status).toBe(503);
  });
});
