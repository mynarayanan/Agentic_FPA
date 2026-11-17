import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, anthropicClient } from '../src';

const ok = (text: string) => async () =>
  new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });

describe('anthropicClient', () => {
  it('sends a deterministic, well-formed Messages API request and returns the text', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const client = anthropicClient({
      apiKey: 'sk-test',
      fetchImpl: (async (url: string, init: RequestInit) => (
        (seen = { url, init }),
        ok('hello')()
      )) as never,
    });
    const out = await client.complete({
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 123,
    });
    expect(out).toBe('hello');
    expect(client.model).toBe(DEFAULT_MODEL);
    expect(seen?.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = seen?.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(seen?.init.body as string)).toEqual({
      model: DEFAULT_MODEL,
      max_tokens: 123,
      temperature: 0,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });
  it('joins multiple text blocks and honours a custom model', async () => {
    const f = async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }],
        }),
        { status: 200 },
      );
    const c = anthropicClient({ apiKey: 'k', model: 'custom', fetchImpl: f as never });
    expect(await c.complete({ system: '', messages: [], maxTokens: 1 })).toBe('ab');
    expect(c.model).toBe('custom');
  });
  it('throws on HTTP errors without leaking the key or body', async () => {
    const f = async () => new Response('{"error":"nope sk-test"}', { status: 429 });
    const c = anthropicClient({ apiKey: 'sk-test', fetchImpl: f as never });
    const err = await c.complete({ system: '', messages: [], maxTokens: 1 }).catch((e: Error) => e);
    expect((err as Error).message).toBe('Anthropic API error 429');
  });
  it('throws when the reply has no text', async () => {
    const c = anthropicClient({
      apiKey: 'k',
      fetchImpl: (async () => new Response(JSON.stringify({}), { status: 200 })) as never,
    });
    await expect(c.complete({ system: '', messages: [], maxTokens: 1 })).rejects.toThrow(/no text/);
  });
  it('aborts a request that exceeds the timeout', async () => {
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const c = anthropicClient({ apiKey: 'k', fetchImpl: hang as never, timeoutMs: 10 });
    await expect(c.complete({ system: '', messages: [], maxTokens: 1 })).rejects.toThrow('aborted');
  });
});
