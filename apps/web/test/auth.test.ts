import { afterEach, describe, expect, it } from 'vitest';
import { hasValidToken, requireWriteToken } from '../lib/auth';

const req = (auth?: string) =>
  new Request('http://x/api', { headers: auth ? { authorization: auth } : {} });
const saved = process.env.API_WRITE_TOKEN;
afterEach(() => {
  if (saved === undefined) delete process.env.API_WRITE_TOKEN;
  else process.env.API_WRITE_TOKEN = saved;
});

describe('write token', () => {
  it('writes are disabled (503) and nobody is valid when no token is configured', async () => {
    delete process.env.API_WRITE_TOKEN;
    expect(hasValidToken(req('Bearer anything'))).toBe(false);
    const r = requireWriteToken(req('Bearer anything'));
    expect(r?.status).toBe(503);
  });
  it('refuses missing, malformed, wrong and wrong-length tokens with 401', () => {
    process.env.API_WRITE_TOKEN = 'correct-horse-battery';
    for (const h of [
      undefined,
      'correct-horse-battery',
      'Basic correct-horse-battery',
      'Bearer ',
      'Bearer wrong-horse-battery',
      'Bearer short',
      'Bearer correct-horse-battery-and-more',
    ]) {
      expect(requireWriteToken(req(h))?.status, String(h)).toBe(401);
      expect(hasValidToken(req(h)), String(h)).toBe(false);
    }
  });
  it('accepts the exact bearer token', () => {
    process.env.API_WRITE_TOKEN = 'correct-horse-battery';
    expect(requireWriteToken(req('Bearer correct-horse-battery'))).toBeNull();
    expect(hasValidToken(req('Bearer correct-horse-battery'))).toBe(true);
  });
});
