import { contentHash } from "./content-hash";
import { isLlmFeatureEnabled, type LlmFeature } from "./feature-flags";
import { resolveModelForFeature, type ModelTier } from "./model-routing";
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

const responseCache = new Map<string, CacheEntry>();
const orgBudgets = new Map<string, BudgetEntry>();

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

function cacheKey(organizationId: string, feature: LlmFeature, hash: string): string {
  return `${organizationId}:${feature}:${hash}`;
}

function getOrgTokens(organizationId: string): number {
  const day = utcDay();
  const entry = orgBudgets.get(organizationId);
  if (!entry || entry.day !== day) return 0;
  return entry.tokens;
}

function addOrgTokens(organizationId: string, tokens: number): void {
  const day = utcDay();
  const entry = orgBudgets.get(organizationId);
  if (!entry || entry.day !== day) {
    orgBudgets.set(organizationId, { day, tokens });
    return;
  }
  entry.tokens += tokens;
}

/**
 * Metered LLM entrypoint: kill-switch → budget → content-hash cache → execute.
 * In-process only (Phase 4 / single worker). Multi-replica shared state → Valkey (Phase 5).
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
  const used = getOrgTokens(request.organizationId);
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
  const key = cacheKey(request.organizationId, request.feature, hash);
  const cached = responseCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now && cached.hash === hash) {
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

  const routed = resolveModelForFeature(request.feature, request.modelTier);
  const executed = await request.execute({
    model: routed.model,
    tier: routed.tier,
  });

  const spent =
    (executed.promptTokens ?? 0) +
    (executed.completionTokens ?? 0) +
    (executed.promptTokens || executed.completionTokens ? 0 : estimated || 1);
  addOrgTokens(request.organizationId, spent);

  responseCache.set(key, {
    hash,
    value: executed.result,
    expiresAt: now + cacheTtlMs(),
  });

  log.info(
    {
      organizationId: request.organizationId,
      feature: request.feature,
      model: routed.model,
      tier: routed.tier,
      spent,
      usedAfter: getOrgTokens(request.organizationId),
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
  responseCache.clear();
  orgBudgets.clear();
}

export function getOrgTokenUsageForTests(organizationId: string): number {
  return getOrgTokens(organizationId);
}
