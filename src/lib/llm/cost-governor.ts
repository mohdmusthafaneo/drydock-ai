import { contentHash } from "./content-hash";
import { isLlmFeatureEnabled, type LlmFeature } from "./feature-flags";
import { resolveModelForFeature, type ModelTier } from "./model-routing";
import { getCacheClient } from "@/lib/cache";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "llm/cost-governor" });

export type LlmCallRequest<T> = {
  organizationId: string;
  feature: LlmFeature;
  /** Content hash inputs — unchanged inputs hit the response cache. */
  cacheKeyParts: unknown;
  /** Estimated prompt tokens (pre-call). */
  estimatedPromptTokens?: number;
  modelTier?: ModelTier;
  /** Execute the underlying LLM call when budget + cache miss. */
  execute: (ctx: { model: string; tier: ModelTier }) => Promise<{
    result: T;
    promptTokens?: number;
    completionTokens?: number;
  }>;
};

export type LlmCallOutcome<T> =
  | { status: "ok"; result: T; cached: boolean; model: string }
  | { status: "skipped"; reason: "feature_disabled" | "budget_exceeded" };

type CacheEntry = {
  hash: string;
  value: unknown;
  expiresAt: number;
};

type BudgetEntry = {
  day: string; // YYYY-MM-DD UTC
  tokens: number;
};

/** In-process fallback when CacheClient is memory (also used by tests via reset). */
const localResponseCache = new Map<string, CacheEntry>();
const localOrgBudgets = new Map<string, BudgetEntry>();

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function cacheTtlMs(): number {
  const raw = process.env.LLM_CACHE_TTL_SEC;
  const sec = raw ? Number.parseInt(raw, 10) : 3600;
  return (Number.isFinite(sec) && sec > 0 ? sec : 3600) * 1000;
}

function dailyTokenBudget(): number {
  const raw = process.env.LLM_ORG_DAILY_TOKEN_BUDGET;
  const n = raw ? Number.parseInt(raw, 10) : 500_000;
  return Number.isFinite(n) && n > 0 ? n : 500_000;
}

function responseCacheKey(
  organizationId: string,
  feature: LlmFeature,
  hash: string,
): string {
  return `llm:resp:${organizationId}:${feature}:${hash}`;
}

function budgetCacheKey(organizationId: string, day: string): string {
  return `llm:budget:${organizationId}:${day}`;
}

async function getOrgTokens(organizationId: string): Promise<number> {
  const day = utcDay();
  const cache = getCacheClient();
  const raw = await cache.get(budgetCacheKey(organizationId, day));
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  const entry = localOrgBudgets.get(organizationId);
  if (!entry || entry.day !== day) return 0;
  return entry.tokens;
}

async function addOrgTokens(
  organizationId: string,
  tokens: number,
): Promise<void> {
  const day = utcDay();
  const current = await getOrgTokens(organizationId);
  const next = current + tokens;
  localOrgBudgets.set(organizationId, { day, tokens: next });
  const cache = getCacheClient();
  // Expire shortly after UTC day boundary (+1h slack).
  await cache.set(budgetCacheKey(organizationId, day), String(next), 90_000);
}

/**
 * Metered LLM entrypoint: kill-switch → budget → content-hash cache → execute.
 * Response cache + org budgets use CacheClient (Valkey when VALKEY_URL is set).
 */
export async function runMeteredLlmCall<T>(
  request: LlmCallRequest<T>,
): Promise<LlmCallOutcome<T>> {
  if (!isLlmFeatureEnabled(request.feature)) {
    log.info(
      { organizationId: request.organizationId, feature: request.feature },
      "llm feature disabled",
    );
    return { status: "skipped", reason: "feature_disabled" };
  }

  const estimated = request.estimatedPromptTokens ?? 0;
  const used = await getOrgTokens(request.organizationId);
  const budget = dailyTokenBudget();
  if (used + estimated > budget) {
    log.warn(
      {
        organizationId: request.organizationId,
        feature: request.feature,
        used,
        budget,
        estimated,
      },
      "llm org daily budget exceeded",
    );
    return { status: "skipped", reason: "budget_exceeded" };
  }

  const hash = contentHash(request.cacheKeyParts);
  const key = responseCacheKey(request.organizationId, request.feature, hash);
  const cache = getCacheClient();
  const now = Date.now();

  const rawCached = await cache.get(key);
  if (rawCached) {
    try {
      const cached = JSON.parse(rawCached) as CacheEntry;
      if (cached.expiresAt > now && cached.hash === hash) {
        log.debug(
          { organizationId: request.organizationId, feature: request.feature },
          "llm cache hit",
        );
        return {
          status: "ok",
          result: cached.value as T,
          cached: true,
          model: "cache",
        };
      }
    } catch {
      // fall through
    }
  }

  const local = localResponseCache.get(key);
  if (local && local.expiresAt > now && local.hash === hash) {
    return {
      status: "ok",
      result: local.value as T,
      cached: true,
      model: "cache",
    };
  }

  const routed = resolveModelForFeature(request.feature, request.modelTier);
  const executed = await request.execute({
    model: routed.model,
    tier: routed.tier,
  });

  const spent =
    (executed.promptTokens ?? 0) +
    (executed.completionTokens ?? 0) +
    (executed.promptTokens || executed.completionTokens ? 0 : estimated || 1);
  await addOrgTokens(request.organizationId, spent);

  const entry: CacheEntry = {
    hash,
    value: executed.result,
    expiresAt: now + cacheTtlMs(),
  };
  localResponseCache.set(key, entry);
  await cache.set(key, JSON.stringify(entry), Math.ceil(cacheTtlMs() / 1000));

  log.info(
    {
      organizationId: request.organizationId,
      feature: request.feature,
      model: routed.model,
      tier: routed.tier,
      spent,
      usedAfter: await getOrgTokens(request.organizationId),
    },
    "llm call metered",
  );

  return {
    status: "ok",
    result: executed.result,
    cached: false,
    model: routed.model,
  };
}

/** Test / ops helpers. */
export function resetLlmGovernorForTests(): void {
  localResponseCache.clear();
  localOrgBudgets.clear();
}

export async function getOrgTokenUsageForTests(
  organizationId: string,
): Promise<number> {
  return getOrgTokens(organizationId);
}
