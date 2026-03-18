export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type ApiClient = {
  getJson: <T = unknown>(path: string) => Promise<T>;
  postJson: <T = unknown>(path: string, body: unknown) => Promise<T>;
  postSse: (path: string, body: unknown, opts?: { signal?: AbortSignal }) => AsyncGenerator<string>;
};

export function createApiClient(baseUrl = ''): ApiClient {
  const makeUrl = (path: string) => `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  let csrfToken: string | null = null;
  let csrfPromise: Promise<string> | null = null;

  async function ensureCsrfToken(): Promise<string> {
    if (csrfToken) return csrfToken;
    if (!csrfPromise) {
      csrfPromise = (async () => {
        const res = await fetch(makeUrl('/csrf-token'), { method: 'GET', credentials: 'include' });
        if (!res.ok) throw new Error(`GET /csrf-token failed: ${res.status}`);
        const json = (await res.json()) as any;
        if (!json?.token || typeof json.token !== 'string') throw new Error('Invalid CSRF token response');
        csrfToken = json.token;
        return csrfToken;
      })().finally(() => {
        csrfPromise = null;
      });
    }
    return await csrfPromise;
  }

  async function headersJson(): Promise<Record<string, string>> {
    const token = await ensureCsrfToken();
    return { 'Content-Type': 'application/json', 'X-CSRF-Token': token };
  }

  async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(makeUrl(path), { method: 'GET', credentials: 'include' });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(makeUrl(path), {
      method: 'POST',
      credentials: 'include',
      headers: await headersJson(),
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  async function* postSse(path: string, body: unknown, opts?: { signal?: AbortSignal }): AsyncGenerator<string> {
    const res = await fetch(makeUrl(path), {
      method: 'POST',
      credentials: 'include',
      headers: await headersJson(),
      body: JSON.stringify(body ?? {}),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`POST ${path} failed: ${res.status} ${text}`);
    }
    if (!res.body) throw new Error('Streaming body not available');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE frames separated by blank line
      while (true) {
        const idx = buf.indexOf('\n\n');
        if (idx < 0) break;
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);

        const lines = frame.split('\n');
        for (const line of lines) {
          const trimmed = line.trimEnd();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trimStart();
          if (!data) continue;
          yield data;
        }
      }
    }
  }

  return { getJson, postJson, postSse };
}

