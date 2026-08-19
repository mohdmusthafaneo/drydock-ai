import { p as prisma } from './prisma.mjs';
import { z } from 'zod';
import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';
import Redis from 'ioredis';
import { SignJWT } from 'jose';
import { createPrivateKey } from 'node:crypto';
import { d as decryptToken, e as encryptToken } from './token-crypto.mjs';

const optionalBoolean = z.string().optional().transform((value) => {
  if (value === void 0) return void 0;
  return value === "true" || value === "1";
});
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  PLATFORM_WORKER_SECRET: z.string().optional(),
  AIDOS_PROCESS_ROLE: z.enum(["web", "worker"]).default("web"),
  AIDOS_API_URL: z.string().url().optional(),
  /** Comma-separated worker queue roles: all | agents | refresh | enrich | ml | retention */
  WORKER_QUEUES: z.string().optional(),
  /** Base URL for the Python ML inference sidecar (Phase 4). */
  ML_INFERENCE_URL: z.string().url().optional(),
  /** Interval (seconds) for retention.ensure schedule; default daily 04:00 UTC. */
  RETENTION_ENSURE_INTERVAL_SEC: z.coerce.number().int().positive().optional(),
  /** Valkey/Redis URL for shared cache across web replicas (Phase 5). */
  VALKEY_URL: z.string().url().optional(),
  /** Optional Postgres read replica for analytics (falls back to DATABASE_URL). */
  DATABASE_URL_REPLICA: z.string().min(1).optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  /** Global LLM kill-switch (`true` disables all metered features). */
  LLM_KILL_SWITCH: optionalBoolean,
  LLM_ORG_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().optional(),
  LLM_MODEL_DEFAULT: z.string().optional(),
  LLM_MODEL_CHEAP: z.string().optional(),
  LLM_CACHE_TTL_SEC: z.coerce.number().int().positive().optional(),
  MASTRA_PG_SCHEMA: z.string().min(1).optional(),
  MASTRA_DISCOVERY_DNA_LLM_ENABLED: optionalBoolean,
  MASTRA_MVP_ACCELERATOR_LLM_ENABLED: optionalBoolean,
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  ATLASSIAN_CLIENT_ID: z.string().optional(),
  ATLASSIAN_CLIENT_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});
let cachedEnv = null;
function formatZodError(error) {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
function getEnv() {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${formatZodError(result.error)}`);
  }
  cachedEnv = result.data;
  return cachedEnv;
}

const logContext = new AsyncLocalStorage();
function createRootLogger() {
  const { LOG_LEVEL } = getEnv();
  return pino({ level: LOG_LEVEL });
}
let rootLogger = null;
function getRootLogger() {
  if (!rootLogger) {
    rootLogger = createRootLogger();
  }
  return rootLogger;
}
function getCorrelationId() {
  return logContext.getStore()?.correlationId;
}
function createLogger(bindings) {
  const correlationId = getCorrelationId();
  const logger = getRootLogger();
  if (!correlationId && !bindings) {
    return logger;
  }
  return logger.child({
    ...correlationId ? { correlationId } : {},
    ...bindings
  });
}

class MemoryCacheClient {
  constructor() {
    this.store = /* @__PURE__ */ new Map();
    this.subs = /* @__PURE__ */ new Map();
  }
  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key, value, ttlSec) {
    this.store.set(key, {
      value,
      expiresAt: ttlSec !== void 0 && ttlSec > 0 ? Date.now() + ttlSec * 1e3 : null
    });
  }
  async del(key) {
    this.store.delete(key);
  }
  async setNx(key, value, ttlSec) {
    const existing = await this.get(key);
    if (existing !== null) return false;
    await this.set(key, value, ttlSec);
    return true;
  }
  async publish(channel, message) {
    const handlers = this.subs.get(channel);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(message);
      } catch {
      }
    }
  }
  async subscribe(channel, handler) {
    let set = this.subs.get(channel);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.subs.set(channel, set);
    }
    set.add(handler);
    return async () => {
      set.delete(handler);
      if (set.size === 0) this.subs.delete(channel);
    };
  }
  /** Test helper */
  clear() {
    this.store.clear();
    this.subs.clear();
  }
}

class ValkeyCacheClient {
  constructor(url) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false
    });
    this.sub = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false
    });
  }
  async get(key) {
    return this.client.get(key);
  }
  async set(key, value, ttlSec) {
    if (ttlSec !== void 0 && ttlSec > 0) {
      await this.client.set(key, value, "EX", ttlSec);
      return;
    }
    await this.client.set(key, value);
  }
  async del(key) {
    await this.client.del(key);
  }
  async setNx(key, value, ttlSec) {
    const result = await this.client.set(key, value, "EX", ttlSec, "NX");
    return result === "OK";
  }
  async publish(channel, message) {
    await this.client.publish(channel, message);
  }
  async subscribe(channel, handler) {
    const listener = (ch, message) => {
      if (ch === channel) handler(message);
    };
    this.sub.on("message", listener);
    await this.sub.subscribe(channel);
    return async () => {
      this.sub.off("message", listener);
      await this.sub.unsubscribe(channel);
    };
  }
  async quit() {
    await Promise.allSettled([this.client.quit(), this.sub.quit()]);
  }
}

const log = createLogger({ component: "cache" });
const globalForCache = globalThis;
function resolveValkeyUrl() {
  return process.env.VALKEY_URL?.trim() || getEnv().VALKEY_URL?.trim() || void 0;
}
function getCacheClient() {
  if (globalForCache.aidosCacheClient) {
    return globalForCache.aidosCacheClient;
  }
  const url = resolveValkeyUrl();
  if (url) {
    log.info("cache backend: valkey");
    const client2 = new ValkeyCacheClient(url);
    globalForCache.aidosCacheClient = client2;
    globalForCache.aidosCacheBackend = "valkey";
    return client2;
  }
  log.info("cache backend: memory");
  const client = new MemoryCacheClient();
  globalForCache.aidosCacheClient = client;
  globalForCache.aidosCacheBackend = "memory";
  return client;
}

class HttpResponseError extends Error {
  constructor(message, status, bodyText) {
    super(message);
    this.status = status;
    this.bodyText = bodyText;
    this.name = "HttpResponseError";
  }
}
const DEFAULT_TIMEOUT_MS = 3e4;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUSES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 6e4;
const RATE_LIMIT_TOKENS_PER_SEC = 10;
const RATE_LIMIT_BURST = 20;
const circuits = /* @__PURE__ */ new Map();
const rateBuckets = /* @__PURE__ */ new Map();
function scopeKey(scope) {
  if (!scope) return "global";
  return `${scope.organizationId ?? "global"}:${scope.provider}`;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function jitteredBackoffMs(attempt, retryAfterSec) {
  if (retryAfterSec && retryAfterSec > 0) {
    return retryAfterSec * 1e3 + Math.floor(Math.random() * 250);
  }
  const base = Math.min(3e4, 500 * 2 ** attempt);
  return base + Math.floor(Math.random() * base * 0.25);
}
function assertCircuitAllows(key) {
  const state = circuits.get(key) ?? { failures: 0, openedAt: null };
  if (state.openedAt === null) return;
  if (Date.now() - state.openedAt >= CIRCUIT_COOLDOWN_MS) {
    circuits.set(key, { failures: state.failures, openedAt: null });
    return;
  }
  throw new HttpResponseError(
    `Circuit open for ${key} \u2014 upstream failures exceeded threshold`,
    503
  );
}
function recordCircuitSuccess(key) {
  circuits.set(key, { failures: 0, openedAt: null });
}
function recordCircuitFailure(key) {
  const state = circuits.get(key) ?? { failures: 0, openedAt: null };
  const failures = state.failures + 1;
  circuits.set(key, {
    failures,
    openedAt: failures >= CIRCUIT_FAILURE_THRESHOLD ? Date.now() : state.openedAt
  });
}
async function acquireRateToken(key) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) ?? {
    tokens: RATE_LIMIT_BURST,
    lastRefillMs: now
  };
  const elapsedSec = (now - bucket.lastRefillMs) / 1e3;
  const refilled = Math.min(
    RATE_LIMIT_BURST,
    bucket.tokens + elapsedSec * RATE_LIMIT_TOKENS_PER_SEC
  );
  if (refilled < 1) {
    const waitMs = Math.ceil((1 - refilled) / RATE_LIMIT_TOKENS_PER_SEC * 1e3);
    await sleep(waitMs);
    return acquireRateToken(key);
  }
  rateBuckets.set(key, {
    tokens: refilled - 1,
    lastRefillMs: now
  });
}
function parseRetryAfterSec(response) {
  const header = response.headers.get("retry-after");
  if (!header) return void 0;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1e3));
  }
  return void 0;
}
async function httpFetch(options) {
  const key = scopeKey(options.scope);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  assertCircuitAllows(key);
  await acquireRateToken(key);
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(options.url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: AbortSignal.timeout(timeoutMs)
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
      const bodyText = await response.text().catch(() => void 0);
      recordCircuitFailure(key);
      throw new HttpResponseError(
        bodyText || `HTTP ${response.status}`,
        response.status,
        bodyText
      );
    } catch (err) {
      lastError = err;
      if (err instanceof HttpResponseError) throw err;
      if (attempt < maxAttempts - 1) {
        await sleep(jitteredBackoffMs(attempt));
        continue;
      }
      recordCircuitFailure(key);
      const message = err instanceof Error && err.name === "TimeoutError" ? `Request timed out after ${timeoutMs}ms` : err instanceof Error ? err.message : "Network request failed";
      throw new HttpResponseError(message, 502);
    }
  }
  throw lastError instanceof Error ? lastError : new HttpResponseError("Request failed after retries", 502);
}

const GITHUB_API = "https://api.github.com";
const APP_JWT_MAX_AGE_SECS = 60 * 9;
const INSTALL_TOKEN_TTL_MS = 55 * 60 * 1e3;
class GithubAppError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "GithubAppError";
  }
}
function getAppId() {
  const id = process.env.GITHUB_APP_ID;
  if (!id) throw new GithubAppError("GITHUB_APP_ID is not set");
  const parsed = Number.parseInt(id, 10);
  if (!Number.isFinite(parsed)) throw new GithubAppError("GITHUB_APP_ID must be numeric");
  return parsed;
}
function getPrivateKeyPem() {
  const key = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!key) throw new GithubAppError("GITHUB_APP_PRIVATE_KEY is not set");
  return key.replace(/\\n/g, "\n");
}
async function importPrivateKey(pem) {
  return createPrivateKey(pem);
}
function cacheKey(installationId) {
  return `github:install-token:${installationId}`;
}
async function mintAppJWT() {
  const appId = getAppId();
  const key = await importPrivateKey(getPrivateKeyPem());
  const now = Math.floor(Date.now() / 1e3);
  return new SignJWT({}).setProtectedHeader({ alg: "RS256" }).setIssuedAt(now).setExpirationTime(now + APP_JWT_MAX_AGE_SECS).setIssuer(String(appId)).sign(key);
}
async function getInstallationToken(installationId) {
  const cache = getCacheClient();
  const key = cacheKey(installationId);
  const raw = await cache.get(key);
  if (raw) {
    try {
      const cached = JSON.parse(raw);
      if (cached.expiresAt > Date.now() && cached.token) {
        return cached.token;
      }
    } catch {
    }
  }
  const appJwt = await mintAppJWT();
  let res;
  try {
    res = await httpFetch({
      url: `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      scope: { provider: "github-app" }
    });
  } catch (err) {
    const status = err instanceof HttpResponseError ? err.status : void 0;
    const text = err instanceof HttpResponseError ? err.bodyText ?? err.message : String(err);
    throw new GithubAppError(
      text || `Failed to create installation token`,
      status
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new GithubAppError(
      text || `Failed to create installation token (${res.status})`,
      res.status
    );
  }
  const data = await res.json();
  if (!data.token) {
    throw new GithubAppError("Installation token missing from GitHub response");
  }
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() - 6e4 : Date.now() + INSTALL_TOKEN_TTL_MS;
  const ttlSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1e3));
  await cache.set(
    key,
    JSON.stringify({ token: data.token, expiresAt }),
    ttlSec
  );
  return data.token;
}

function readJsonField(value, fallback) {
  if (value === null || value === void 0) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function parseIntegrationMeta(metadataJson) {
  return readJsonField(metadataJson, {});
}

const INSTALL_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1e3;
function orgCacheKey(organizationId) {
  return `github:org-token:${organizationId}`;
}
async function getGitHubCredentialToken(organizationId) {
  const cache = getCacheClient();
  const key = orgCacheKey(organizationId);
  const raw = await cache.get(key);
  if (raw) {
    try {
      const cached = JSON.parse(raw);
      if (cached.expiresAt > Date.now() && cached.token) {
        return cached.token;
      }
    } catch {
    }
  }
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "GITHUB" }
    }
  });
  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("GitHub is not connected for this organization");
  }
  const meta = parseIntegrationMeta(integration.metadataJson);
  if (!meta.installationId) {
    throw new Error(
      "GitHub App not installed \u2014 install the AIDOS app from Integrations, then sync again."
    );
  }
  try {
    const token = await getInstallationToken(meta.installationId);
    const expiresAt = Date.now() + 55 * 60 * 1e3 - INSTALL_TOKEN_REFRESH_BUFFER_MS;
    const ttlSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1e3));
    await cache.set(
      key,
      JSON.stringify({ token, expiresAt }),
      ttlSec
    );
    return token;
  } catch (e) {
    if (e instanceof GithubAppError) {
      if (e.message.includes("GITHUB_APP_ID") || e.message.includes("PRIVATE_KEY")) {
        throw new Error(
          "GitHub App credentials missing \u2014 set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in .env"
        );
      }
      throw new Error(
        `GitHub App token failed (${e.status ?? "unknown"}): ${e.message}. Reinstall the app from Integrations.`
      );
    }
    throw e;
  }
}

function getAppUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) {
    return "http://localhost:3000";
  }
  const url = new URL(raw);
  return url.origin;
}

const ATLASSIAN_AUTH = "https://auth.atlassian.com";
function getJiraOAuthRedirectUri(flow = "session") {
  const base = getAppUrl();
  if (flow === "external") {
    return `${base}/api/integrations/external/jira/callback`;
  }
  return `${base}/api/integrations/jira/callback`;
}
function getJiraOAuthConfig(flow = "session") {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
  const redirectUri = getJiraOAuthRedirectUri(flow);
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret)
  };
}
async function postToken(body) {
  const { clientId, clientSecret } = getJiraOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Jira OAuth is not configured");
  }
  const res = await fetch(`${ATLASSIAN_AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      ...body
    })
  });
  const data = await res.json();
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope ?? ""
  };
}
async function refreshJiraAccessToken(refreshToken) {
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
}
async function fetchJiraMyself(accessToken, cloudId) {
  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      next: { revalidate: 0 }
    }
  );
  if (!res.ok) {
    throw new Error("Failed to fetch Jira user profile");
  }
  return res.json();
}

function parseJiraMeta(metadataJson) {
  return readJsonField(metadataJson, {});
}
function mergeJiraMeta(existing, patch) {
  return JSON.stringify({ ...existing, ...patch });
}

function getJiraAccessToken(integration) {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.accessTokenEnc) return null;
  try {
    return decryptToken(meta.accessTokenEnc);
  } catch {
    return null;
  }
}
function getJiraRefreshToken(integration) {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.refreshTokenEnc) return null;
  try {
    return decryptToken(meta.refreshTokenEnc);
  } catch {
    return null;
  }
}

async function withCredentialAdvisoryLock(organizationId, provider, fn) {
  const lockKey = `${organizationId}:${provider}`;
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      return fn();
    },
    { maxWait: 3e4, timeout: 6e4 }
  );
}

const JIRA_API$1 = "https://api.atlassian.com/ex/jira";
async function probeJiraToken(accessToken, cloudId, organizationId) {
  try {
    await httpFetch({
      url: `${JIRA_API$1}/${cloudId}/rest/api/3/myself`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      scope: { provider: "jira", organizationId },
      maxAttempts: 1
    });
    return true;
  } catch (err) {
    if (err instanceof HttpResponseError && err.status === 401) return false;
    throw err;
  }
}
async function refreshAndPersistJiraTokens(organizationId, refreshToken, cloudId) {
  const refreshed = await refreshJiraAccessToken(refreshToken);
  await httpFetch({
    url: `${JIRA_API$1}/${cloudId}/rest/api/3/myself`,
    headers: {
      Authorization: `Bearer ${refreshed.accessToken}`,
      Accept: "application/json"
    },
    scope: { provider: "jira", organizationId },
    maxAttempts: 1
  });
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" }
    }
  });
  if (!integration) {
    throw new Error("Jira integration disappeared during token refresh");
  }
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      metadataJson: mergeJiraMeta(parseJiraMeta(integration.metadataJson), {
        accessTokenEnc: encryptToken(refreshed.accessToken),
        refreshTokenEnc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : parseJiraMeta(integration.metadataJson).refreshTokenEnc
      }),
      lastError: null
    }
  });
  return refreshed.accessToken;
}
async function getJiraCredentialToken(organizationId) {
  return withCredentialAdvisoryLock(organizationId, "JIRA", async () => {
    const integration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "JIRA" }
      }
    });
    if (!integration || integration.status !== "CONNECTED") {
      throw new Error("Jira is not connected for this organization");
    }
    const meta = parseJiraMeta(integration.metadataJson);
    if (!meta.cloudId) {
      throw new Error("Missing cloudId in Jira integration metadata");
    }
    let accessToken = getJiraAccessToken(integration);
    if (!accessToken) {
      throw new Error("Jira token missing \u2014 reconnect via OAuth");
    }
    const stillValid = await probeJiraToken(
      accessToken,
      meta.cloudId,
      organizationId
    );
    if (stillValid) return accessToken;
    const refreshToken = getJiraRefreshToken(integration);
    if (!refreshToken) {
      throw new Error("Jira access token expired \u2014 reconnect via OAuth");
    }
    return refreshAndPersistJiraTokens(
      organizationId,
      refreshToken,
      meta.cloudId
    );
  });
}

async function getRotatingRefreshCredentialToken(organizationId, provider) {
  return withCredentialAdvisoryLock(organizationId, provider, async () => {
    throw new Error(
      `${provider} integration is not available yet \u2014 credential refresh contract is reserved`
    );
  });
}

class DefaultProviderCredentials {
  async getAccessToken(organizationId, provider) {
    switch (provider) {
      case "GITHUB":
        return getGitHubCredentialToken(organizationId);
      case "JIRA":
        return getJiraCredentialToken(organizationId);
      case "GITLAB":
        return getRotatingRefreshCredentialToken(organizationId, "GITLAB");
      case "BITBUCKET":
        return getRotatingRefreshCredentialToken(organizationId, "BITBUCKET");
      default: {
        const exhaustive = provider;
        throw new Error(`Unsupported credential provider: ${exhaustive}`);
      }
    }
  }
}
const providerCredentials = new DefaultProviderCredentials();

export { HttpResponseError as H, providerCredentials as a, parseJiraMeta as b, fetchJiraMyself as f, httpFetch as h, mergeJiraMeta as m, parseIntegrationMeta as p, readJsonField as r };
