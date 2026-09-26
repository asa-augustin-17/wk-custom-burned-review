import { describe, expect, it, vi } from 'vitest';
import { WkApiError, WkClient } from './client';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function makeClient(fetchImpl: typeof fetch, nowRef = { t: 0 }) {
  const sleeps: number[] = [];
  const client = new WkClient({
    token: 'secret-token',
    fetchImpl,
    now: () => nowRef.t,
    sleep: async (ms) => {
      sleeps.push(ms);
      nowRef.t += ms;
    },
  });
  return { client, sleeps };
}

describe('WkClient', () => {
  it('sends auth and revision headers', async () => {
    const fetchImpl = vi.fn(async () => json({ data: { username: 'x' } }));
    const { client } = makeClient(fetchImpl);
    await client.request('/user');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.wanikani.com/v2/user');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token', 'Wanikani-Revision': '20170710' });
  });

  it('follows pages.next_url and spaces requests', async () => {
    const pages = [
      { pages: { next_url: 'https://api.wanikani.com/v2/x?page_after_id=1' }, total_count: 3, data: [{ id: 1 }, { id: 2 }] },
      { pages: { next_url: null }, total_count: 3, data: [{ id: 3 }] },
    ];
    let i = 0;
    const fetchImpl = vi.fn(async () => json(pages[i++]));
    const { client, sleeps } = makeClient(fetchImpl);
    const seen: number[] = [];
    const all = await client.getAll('/x', (page) => seen.push(page));
    expect(all.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(seen).toEqual([1, 2]);
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe('https://api.wanikani.com/v2/x?page_after_id=1');
    expect(sleeps).toEqual([1100]);
    expect(client.requestCount).toBe(2);
  });

  it('waits until RateLimit-Reset on 429 then retries', async () => {
    const nowRef = { t: 1_000_000 };
    let call = 0;
    const fetchImpl = vi.fn(async () =>
      call++ === 0 ? json({ error: 'Rate limit' }, 429, { 'RateLimit-Reset': String(1_000_000 / 1000 + 10) }) : json({ ok: true }),
    );
    const { client, sleeps } = makeClient(fetchImpl, nowRef);
    await expect(client.request('/user')).resolves.toEqual({ ok: true });
    expect(sleeps[0]).toBe(10_500);
  });

  it('throws WkApiError with status on 401', async () => {
    const { client } = makeClient(async () => json({ error: 'Unauthorized' }, 401));
    await expect(client.request('/user')).rejects.toSatisfy((e: unknown) => e instanceof WkApiError && e.status === 401);
  });
});
