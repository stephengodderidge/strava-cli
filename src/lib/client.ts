/**
 * StravaClient — a thin, typed wrapper over the Strava API v3 using native fetch.
 *
 *  - Injects the bearer token (refreshed transparently via auth.ts).
 *  - Integrates the on-disk cache (per-request TTL, honoring a global toggle).
 *  - Normalizes HTTP failures into AppError with stable codes.
 *  - Surfaces rate-limit usage from response headers.
 *  - Retries once after a forced token refresh on 401.
 */

import { STRAVA_API_BASE } from './config.js';
import { ensureAccessToken, forceRefresh } from './auth.js';
import { readCache, writeCache } from './cache.js';
import { AppError } from './output.js';

export interface RateLimit {
  limit_15min: number;
  limit_daily: number;
  usage_15min: number;
  usage_daily: number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  /** Cache TTL in seconds for this request; 0 (default) disables caching. */
  ttl?: number;
}

export class StravaClient {
  private readonly cacheEnabled: boolean;
  /** Rate-limit usage from the most recent network response, if any. */
  lastRateLimit: RateLimit | null = null;

  constructor(opts: { useCache?: boolean } = {}) {
    this.cacheEnabled = opts.useCache ?? true;
  }

  async get<T>(apiPath: string, options: RequestOptions = {}): Promise<T> {
    const url = buildUrl(apiPath, options.query);
    const ttl = options.ttl ?? 0;
    const useCache = this.cacheEnabled && ttl > 0;

    if (useCache) {
      const hit = readCache<T>(url, ttl);
      if (hit !== null) return hit;
    }

    const token = await ensureAccessToken();
    const data = await this.fetchJson<T>(url, token);

    if (useCache) writeCache(url, data);
    return data;
  }

  private async fetchJson<T>(url: string, token: string, isRetry = false): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    } catch (err) {
      throw new AppError('network', `Network error contacting Strava: ${(err as Error).message}`, {
        hint: 'Check your internet connection and try again.',
      });
    }

    this.captureRateLimit(res);

    if (res.ok) {
      return (await res.json()) as T;
    }

    const bodyText = await res.text();
    const details = safeJson(bodyText);

    if (res.status === 401 && !isRetry) {
      const refreshed = await forceRefresh();
      if (refreshed) return this.fetchJson<T>(url, refreshed, true);
    }

    switch (res.status) {
      case 401:
        throw new AppError('auth', 'Strava rejected the access token (HTTP 401).', {
          hint: 'Run `strava auth login` again, or check your refresh token / scopes.',
          details,
        });
      case 403:
        throw new AppError('auth', 'Access forbidden (HTTP 403).', {
          hint: 'Your token may lack the required scope (e.g. activity:read_all).',
          details,
        });
      case 404:
        throw new AppError('not_found', 'Resource not found (HTTP 404).', { details });
      case 429:
        throw new AppError('rate_limited', 'Strava rate limit exceeded (HTTP 429).', {
          hint: this.rateLimitHint(),
          details: this.lastRateLimit ?? details,
        });
      default:
        throw new AppError('api_error', `Strava API error (HTTP ${res.status}).`, { details });
    }
  }

  private captureRateLimit(res: Response): void {
    const limit = res.headers.get('x-ratelimit-limit');
    const usage = res.headers.get('x-ratelimit-usage');
    if (!limit || !usage) return;
    const [l15, lDay] = limit.split(',').map((n) => Number.parseInt(n.trim(), 10));
    const [u15, uDay] = usage.split(',').map((n) => Number.parseInt(n.trim(), 10));
    this.lastRateLimit = {
      limit_15min: l15 ?? 0,
      limit_daily: lDay ?? 0,
      usage_15min: u15 ?? 0,
      usage_daily: uDay ?? 0,
    };
  }

  private rateLimitHint(): string {
    if (!this.lastRateLimit) return 'Wait for the 15-minute window to reset and retry.';
    const { usage_15min, limit_15min, usage_daily, limit_daily } = this.lastRateLimit;
    return `Used ${usage_15min}/${limit_15min} (15 min) and ${usage_daily}/${limit_daily} (daily). Wait for the window to reset.`;
  }
}

function buildUrl(
  apiPath: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(apiPath.replace(/^\//, ''), `${STRAVA_API_BASE}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
