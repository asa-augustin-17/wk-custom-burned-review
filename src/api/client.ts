// Fetch wrapper for the WaniKani API v2: auth headers, pagination,
// request spacing, and 429 retry. The token is never logged.

export const WK_BASE_URL = 'https://api.wanikani.com/v2';
const WK_REVISION = '20170710';

export class WkApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'WkApiError';
    this.status = status;
  }
}

export interface WkResource<T> {
  id: number;
  object: string;
  url: string;
  data_updated_at: string | null;
  data: T;
}

export interface WkCollection<T> {
  object: 'collection';
  url: string;
  pages: { next_url: string | null; previous_url: string | null; per_page: number };
  total_count: number;
  data_updated_at: string | null;
  data: WkResource<T>[];
}

export interface WkClientOptions {
  token: string;
  /** Minimum gap between requests, in ms. Keeps bulk sync under 60 req/min. */
  minIntervalMs?: number;
  /** Max retries for a single request after 429 or network error. */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class WkClient {
  private readonly token: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private lastRequestAt = -Infinity;
  /** Number of HTTP requests actually sent (useful for comparing sync costs). */
  requestCount = 0;

  constructor(opts: WkClientOptions) {
    this.token = opts.token.trim();
    this.minIntervalMs = opts.minIntervalMs ?? 1100;
    this.maxRetries = opts.maxRetries ?? 3;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
  }

  private resolveUrl(pathOrUrl: string): string {
    return pathOrUrl.startsWith('http') ? pathOrUrl : `${WK_BASE_URL}${pathOrUrl}`;
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();
  }

  async request<T>(pathOrUrl: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const url = this.resolveUrl(pathOrUrl);
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      this.requestCount++;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: init.method ?? 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Wanikani-Revision': WK_REVISION,
            ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
      } catch {
        if (attempt < this.maxRetries) {
          await this.sleep(2000 * (attempt + 1));
          continue;
        }
        throw new WkApiError(0, 'Network error: could not reach api.wanikani.com.');
      }

      if (res.status === 429 && attempt < this.maxRetries) {
        await this.sleep(this.rateLimitWaitMs(res));
        continue;
      }
      if (!res.ok) throw new WkApiError(res.status, await errorMessage(res));
      return (await res.json()) as T;
    }
  }

  /** How long to wait after a 429. Uses RateLimit-Reset (Unix seconds) when readable. */
  private rateLimitWaitMs(res: Response): number {
    const reset = Number(res.headers.get('RateLimit-Reset'));
    if (Number.isFinite(reset) && reset > 0) {
      return Math.max(1000, reset * 1000 - this.now() + 500);
    }
    // Header may be hidden by CORS; fall back to a full rate-limit window.
    return 60_000;
  }

  /** Fetches every page of a collection, following pages.next_url until null. */
  async getAll<T>(
    path: string,
    onPage?: (page: number, fetchedSoFar: number, total: number) => void,
  ): Promise<WkResource<T>[]> {
    const out: WkResource<T>[] = [];
    let next: string | null = path;
    let page = 0;
    while (next) {
      const col: WkCollection<T> = await this.request<WkCollection<T>>(next);
      page++;
      out.push(...col.data);
      onPage?.(page, out.length, col.total_count);
      next = col.pages.next_url;
    }
    return out;
  }
}

async function errorMessage(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: string };
    detail = body.error ?? '';
  } catch {
    /* non-JSON body */
  }
  switch (res.status) {
    case 401:
      return 'Unauthorized: the API token is invalid or has been revoked.';
    case 403:
      return 'Forbidden: this token lacks the permission required for this action.';
    case 404:
      return 'Not found.';
    case 429:
      return 'Rate limited by WaniKani. Try again in a minute.';
    default:
      return `WaniKani API error ${res.status}${detail ? `: ${detail}` : ''}`;
  }
}
