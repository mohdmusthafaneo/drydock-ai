import { prisma } from "@/lib/prisma";
import { isBriefingEnrichEnabled } from "@/lib/executive-briefing/snapshot-utils";
import { isLlmFeatureEnabled } from "@/lib/llm/feature-flags";

export type EnrichExecutiveBriefingResult =
  | { status: "enriched"; generatedAt: string; expiresAt: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

/**
 * LLM enrich path removed during Mastra four-agent migration.
 * Deterministic briefing still loads via `applyLlmSnapshot: false`.
 */
export async function enrichExecutiveBriefingForOrg(
  organizationId: string,
): Promise<EnrichExecutiveBriefingResult> {
  if (!isBriefingEnrichEnabled()) {
    return { status: "skipped", reason: "enrich_disabled" };
  }

  if (!isLlmFeatureEnabled("executive_briefing")) {
    return { status: "skipped", reason: "llm_feature_disabled" };
  }

  const dna = await prisma.deliveryDNA.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  if (!dna) {
    return { status: "skipped", reason: "no_delivery_dna" };
  }

  return { status: "skipped", reason: "mastra_migration" };
}
