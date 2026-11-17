export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface LlmClient {
  readonly model: string;
  complete(req: { system: string; messages: ChatMessage[]; maxTokens: number }): Promise<string>;
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Minimal Anthropic Messages API client over fetch (no SDK, so it runs anywhere and is easy to fake in tests). */
export function anthropicClient(opts: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): LlmClient {
  const model = opts.model ?? DEFAULT_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    model,
    async complete({ system, messages, maxTokens }) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
      try {
        const res = await doFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': opts.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, system, messages }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
        const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
        const text = (body.content ?? [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('');
        if (!text) throw new Error('Anthropic API returned no text');
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
