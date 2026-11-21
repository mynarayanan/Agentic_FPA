'use client';

const KEY = 'fpa_token';
const ACTOR = 'fpa_actor';

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
export const getToken = (): string => store()?.getItem(KEY) ?? '';
export const setToken = (t: string): void => {
  if (t) store()?.setItem(KEY, t);
  else store()?.removeItem(KEY);
};
export const getActor = (): string => store()?.getItem(ACTOR) ?? '';
export const setActor = (a: string): void => store()?.setItem(ACTOR, a);

/** Authorization header when the user has entered the access token for this browser tab. */
export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

/** fetch + JSON that never throws on a non-JSON error page. */
export async function api<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const data = (await res
    .json()
    .catch(() => ({ error: `unexpected response (${res.status})` }))) as T;
  return { ok: res.ok, status: res.status, data };
}
