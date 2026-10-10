/**
 * websentry-api: the official JavaScript/TypeScript client for the
 * WebSentry security scanner API (https://websentry.dev/docs).
 *
 * Zero dependencies. Works in Node 18+, browsers, and edge runtimes.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface CheckResult {
  name: string;
  label?: string;
  status: CheckStatus;
  value: string;
  description: string;
}

export interface CategoryResult {
  name: string;
  score: number;
  maxScore: number;
  grade: string;
  checks: CheckResult[];
}

export interface ScanSummary {
  ok: boolean;
  scanId: string;
  url: string;
  grade: string;
  score: number;
  /** Present on unauthenticated requests only */
  remaining?: number;
  signupHint?: string;
}

export interface ScanDiff {
  prevScanId: string;
  prevGrade: string;
  prevScore: number;
  prevDate: string;
  fixed: { category: string; check: string }[];
  regressed: { category: string; check: string }[];
}

export interface ScanReport {
  ok: boolean;
  branding: { plan: string; name: string | null; logoUrl: string | null } | null;
  diff: ScanDiff | null;
  scan: {
    id: string;
    url: string;
    grade: string;
    score: number;
    created_at: string;
    results: {
      grade: string;
      score: number;
      durationMs?: number;
      categories: Record<string, CategoryResult>;
    };
  };
}

export interface Monitor {
  id: string;
  url: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  last_grade: string | null;
  last_scan_at: string | null;
  alert_on_drop: number;
  is_active: number;
}

export interface RateLimit {
  limit: number;
  remaining: number;
  /** Unix timestamp; only present on 429 responses */
  reset?: number;
}

export class WebSentryError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rateLimit?: RateLimit,
  ) {
    super(message);
    this.name = 'WebSentryError';
  }
}

export interface WebSentryOptions {
  /** Override the API base URL (defaults to https://websentry.dev) */
  baseUrl?: string;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

function parseRateLimit(headers: Headers): RateLimit | undefined {
  const limit = headers.get('X-RateLimit-Limit');
  if (!limit) return undefined;
  const rl: RateLimit = {
    limit: Number(limit),
    remaining: Number(headers.get('X-RateLimit-Remaining') ?? 0),
  };
  const reset = headers.get('X-RateLimit-Reset');
  if (reset) rl.reset = Number(reset);
  return rl;
}

export class WebSentry {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  /** Rate-limit state from the most recent request, when the API sent it */
  lastRateLimit?: RateLimit;
  /** API version reported by the most recent response */
  apiVersion?: string;

  constructor(apiKey?: string, options: WebSentryOptions = {}) {
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://websentry.dev').replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    this.lastRateLimit = parseRateLimit(res.headers) ?? this.lastRateLimit;
    this.apiVersion = res.headers.get('X-API-Version') ?? this.apiVersion;

    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || data.ok === false) {
      throw new WebSentryError(data.error || `Request failed with status ${res.status}`, res.status, parseRateLimit(res.headers));
    }
    return data as T;
  }

  /**
   * Run a full security scan. Synchronous: the grade and score come back
   * in the same response, typically within 10 to 30 seconds.
   */
  scan(url: string, options: { force?: boolean } = {}): Promise<ScanSummary> {
    return this.request<ScanSummary>('POST', '/api/scan', { url, ...(options.force ? { force: true } : {}) });
  }

  /** Full results for a scan ID, with all 15 categories. Requires Pro or Agency. */
  getScan(scanId: string): Promise<ScanReport> {
    return this.request<ScanReport>('GET', `/api/scan/${encodeURIComponent(scanId)}/json`);
  }

  readonly monitors = {
    /** All monitors on the account. Requires Pro or Agency. */
    list: async (): Promise<Monitor[]> => {
      const res = await this.request<{ ok: boolean; monitors: Monitor[] }>('GET', '/api/monitors');
      return res.monitors;
    },
    /** Create a monitor and run its first scan immediately. */
    create: async (url: string, frequency: Monitor['frequency'] = 'weekly'): Promise<Monitor> => {
      const res = await this.request<{ ok: boolean; monitor: Monitor }>('POST', '/api/monitors', { url, frequency });
      return res.monitor;
    },
    /** Pause or resume a monitor. Returns the new active state. */
    toggle: async (id: string): Promise<boolean> => {
      const res = await this.request<{ ok: boolean; is_active: number }>('PATCH', `/api/monitors/${encodeURIComponent(id)}/toggle`);
      return res.is_active === 1;
    },
    /** Change a monitor's frequency and, optionally, its URL. */
    edit: (id: string, changes: { frequency: Monitor['frequency']; url?: string }): Promise<{ ok: boolean; frequency: string; url: string }> =>
      this.request('PATCH', `/api/monitors/${encodeURIComponent(id)}/edit`, changes),
    /** Permanently delete a monitor. */
    remove: (id: string): Promise<{ ok: boolean }> =>
      this.request('DELETE', `/api/monitors/${encodeURIComponent(id)}`),
  };
}

export default WebSentry;
