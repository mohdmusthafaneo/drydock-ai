import { createHash } from "node:crypto";
import { z } from "zod";

import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import {
  ensureHeadlineSegmentSpacing,
  hasHeadlineSpacingDefects,
} from "@/lib/executive-briefing/headline-format";

const headlineSegmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("emphasis"), text: z.string() }),
]);

const headlineSchema = z.array(headlineSegmentSchema).min(1);

export function countBriefingWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function parseHeadlineJson(
  headlineJson: string,
): ExecutiveBriefing["headline"] | null {
  try {
    const parsed = headlineSchema.safeParse(JSON.parse(headlineJson));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serializeHeadlineJson(
  headline: ExecutiveBriefing["headline"],
): string {
  return JSON.stringify(headline);
}

export function computeBriefingFactsHash(briefing: ExecutiveBriefing): string {
  const payload = {
    healthOverall: briefing.health.overall,
    healthBand: briefing.health.band,
    claimHeadlines: briefing.claims.map((claim) => claim.headline),
    claimVerdicts: briefing.claims.map((claim) => claim.verdict),
    freshnessAsOf: briefing.freshness.asOf,
    freshnessStale: briefing.freshness.stale,
    highlightValues: briefing.highlights.map((item) => ({
      id: item.id,
      value: item.value,
    })),
    insightMessage: briefing.insight?.message ?? null,
    deterministicNarrative: briefing.narrative,
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function getBriefingEnrichIntervalSec(): number {
  const raw = process.env.EXECUTIVE_BRIEFING_ENRICH_INTERVAL_SEC;
  const parsed = raw ? Number.parseInt(raw, 10) : 7200;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7200;
}

export function mergeExecutiveBriefingSnapshot(
  deterministic: ExecutiveBriefing,
  snapshot: {
    headlineJson: string;
    narrative: string;
    expiresAt: Date;
    generatedAt: Date;
  } | null,
  now: Date = new Date(),
): ExecutiveBriefing {
  if (!snapshot || snapshot.expiresAt <= now) {
    return deterministic;
  }

  const headline = parseHeadlineJson(snapshot.headlineJson);
  if (!headline) {
    return deterministic;
  }

  const normalized = ensureHeadlineSegmentSpacing(headline);
  if (hasHeadlineSpacingDefects(normalized)) {
    return deterministic;
  }

  return {
    ...deterministic,
    headline: normalized,
    narrative: snapshot.narrative,
    wordCount: countBriefingWords(snapshot.narrative),
    source: "llm_enriched",
    llmGeneratedAt: snapshot.generatedAt.toISOString(),
  };
}

export function isBriefingEnrichEnabled(): boolean {
  const raw = process.env.EXECUTIVE_BRIEFING_ENRICH_ENABLED;
  if (raw === undefined) return true;
  return raw !== "0" && raw.toLowerCase() !== "false";
}
