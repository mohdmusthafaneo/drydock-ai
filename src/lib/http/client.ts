/**
 * Shared outbound HTTP client — timeouts, retry with jitter, per-scope circuit breaker
 * and token-bucket rate limiting (Phase 2).
 */

export type HttpClientScope = {
  organizationId?: string;
  provider: string;
};

export type HttpRequestOptions = {
  url: string;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  timeoutMs?: number;
  scope?: HttpClientScope;
  /** Max attempts including the first (default 3). */
  maxAttempts?: number;
};

export class HttpResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly bodyText?: string,
  ) {
    super(message);
    this.name = "HttpResponseError";
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 60_000;
const RATE_LIMIT_TOKENS_PER_SEC = 10;
const RATE_LIMIT_BURST = 20;

type CircuitState = {
  failures: number;
  openedAt: number | null;
};

type RateBucket = {
  tokens: number;
  lastRefillMs: number;
};

const circuits = new Map<string, CircuitState>();
const rateBuckets = new Map<string, RateBucket>();

function scopeKey(scope?: HttpClientScope): string {
  if (!scope) return "global";
  return `${scope.organizationId ?? "global"}:${scope.provider}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredBackoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec && retryAfterSec > 0) {
    return retryAfterSec * 1000 + Math.floor(Math.random() * 250);
  }
  const base = Math.min(30_000, 500 * 2 ** attempt);
  return base + Math.floor(Math.random() * base * 0.25);
}

function assertCircuitAllows(key: string): void {
  const state = circuits.get(key) ?? { failures: 0, openedAt: null };
  if (state.openedAt === null) return;

  if (Date.now() - state.openedAt >= CIRCUIT_COOLDOWN_MS) {
    circuits.set(key, { failures: state.failures, openedAt: null });
    return;
  }

  throw new HttpResponseError(
    `Circuit open for ${key} — upstream failures exceeded threshold`,
    503,
  );
}

function recordCircuitSuccess(key: string): void {
  circuits.set(key, { failures: 0, openedAt: null });
}

function recordCircuitFailure(key: string): void {
  const state = circuits.get(key) ?? { failures: 0, openedAt: null };
  const failures = state.failures + 1;
  circuits.set(key, {
    failures,
    openedAt: failures >= CIRCUIT_FAILURE_THRESHOLD ? Date.now() : state.openedAt,
  });
}

async function acquireRateToken(key: string): Promise<void> {
  const now = Date.now();
  const bucket = rateBuckets.get(key) ?? {
    tokens: RATE_LIMIT_BURST,
    lastRefillMs: now,
  };

  const elapsedSec = (now - bucket.lastRefillMs) / 1000;
  const refilled = Math.min(
    RATE_LIMIT_BURST,
    bucket.tokens + elapsedSec * RATE_LIMIT_TOKENS_PER_SEC,
  );

  if (refilled < 1) {
    const waitMs = Math.ceil((1 - refilled) / RATE_LIMIT_TOKENS_PER_SEC * 1000);
    await sleep(waitMs);
    return acquireRateToken(key);
  }

  rateBuckets.set(key, {
    tokens: refilled - 1,
    lastRefillMs: now,
  });
}

function parseRetryAfterSec(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return undefined;
}

/** Resilient fetch with timeout, retries, circuit breaker, and rate limiting. */
export async function httpFetch(options: HttpRequestOptions): Promise<Response> {
  const key = scopeKey(options.scope);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  assertCircuitAllows(key);
  await acquireRateToken(key);

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(options.url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        recordCircuitSuccess(key);
        return response;
      }

      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts - 1) {
        const retryAfter = parseRetryAfterSec(response);
        await sleep(jitteredBackoffMs(attempt, retryAfter));
        continue;
      }

      const bodyText = await response.text().catch(() => undefined);
      recordCircuitFailure(key);
      throw new HttpResponseError(
        bodyText || `HTTP ${response.status}`,
        response.status,
        bodyText,
      );
    } catch (err) {
      lastError = err;
      if (err instanceof HttpResponseError) throw err;

      if (attempt < maxAttempts - 1) {
        await sleep(jitteredBackoffMs(attempt));
        continue;
      }

      recordCircuitFailure(key);
      const message =
        err instanceof Error && err.name === "TimeoutError"
          ? `Request timed out after ${timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : "Network request failed";
      throw new HttpResponseError(message, 502);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new HttpResponseError("Request failed after retries", 502);
}

/** Reset circuit/rate state — for tests. */
export function resetHttpClientState(): void {
  circuits.clear();
  rateBuckets.clear();
}
