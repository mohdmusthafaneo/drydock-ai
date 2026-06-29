import { getMastra } from "@/mastra";
import { prisma } from "@/lib/prisma";
import { loadExecutiveBriefing } from "@/lib/executive-briefing/load-briefing-context";
import {
  computeBriefingFactsHash,
  getBriefingEnrichIntervalSec,
  isBriefingEnrichEnabled,
  serializeHeadlineJson,
} from "@/lib/executive-briefing/snapshot-utils";

export type EnrichExecutiveBriefingResult =
  | { status: "enriched"; generatedAt: string; expiresAt: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

function buildFactsJson(
  briefing: Awaited<ReturnType<typeof loadExecutiveBriefing>>["briefing"],
  orgName: string,
): string {
  return JSON.stringify(
    {
      orgName,
      health: briefing.health,
      claims: briefing.claims,
      highlights: briefing.highlights,
      insight: briefing.insight ?? null,
      freshness: briefing.freshness,
      meta: briefing.meta,
    },
    null,
    2,
  );
}

export async function enrichExecutiveBriefingForOrg(
  organizationId: string,
): Promise<EnrichExecutiveBriefingResult> {
  if (!isBriefingEnrichEnabled()) {
    return { status: "skipped", reason: "enrich_disabled" };
  }

  const dna = await prisma.deliveryDNA.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  if (!dna) {
    return { status: "skipped", reason: "no_delivery_dna" };
  }

  const { briefing, orgName } = await loadExecutiveBriefing(organizationId, {
    applyLlmSnapshot: false,
  });

  const factsHash = computeBriefingFactsHash(briefing);
  const existing = await prisma.executiveBriefingSnapshot.findUnique({
    where: { organizationId },
    select: { factsHash: true, expiresAt: true },
  });

  const now = new Date();
  if (
    existing &&
    existing.factsHash === factsHash &&
    existing.expiresAt > now
  ) {
    return { status: "skipped", reason: "unchanged_and_fresh" };
  }

  const factsJson = buildFactsJson(briefing, orgName);

  try {
    const mastra = await getMastra();
    const workflow = mastra.getWorkflow("executiveBriefingEnrichWorkflow");
    const run = await workflow.createRun();
    const workflowResult = await run.start({
      inputData: {
        orgName,
        deterministicHeadline: briefing.headline,
        narrative: briefing.narrative,
        health: {
          overall: briefing.health.overall,
          band: briefing.health.band,
          bandLabel: briefing.health.bandLabel,
          dataGaps: briefing.health.dataGaps,
        },
        claims: briefing.claims.map((claim) => ({
          id: claim.id,
          headline: claim.headline,
          verdict: claim.verdict,
          verdictLabel: claim.verdictLabel,
          context: claim.context,
          metric: claim.metric,
        })),
        highlights: briefing.highlights.map((highlight) => ({
          id: highlight.id,
          value: highlight.value,
        })),
        freshness: briefing.freshness,
        factsJson,
      },
    });

    if (workflowResult.status !== "success") {
      return {
        status: "failed",
        error: `workflow_${workflowResult.status}`,
      };
    }

    const output = workflowResult.result;
    if (!output.enriched) {
      return { status: "skipped", reason: "llm_passthrough" };
    }

    const intervalSec = getBriefingEnrichIntervalSec();
    const generatedAt = now;
    const expiresAt = new Date(generatedAt.getTime() + intervalSec * 1000);

    await prisma.executiveBriefingSnapshot.upsert({
      where: { organizationId },
      create: {
        organizationId,
        headlineJson: serializeHeadlineJson(output.headline),
        narrative: output.narrative,
        source: "llm_enriched",
        factsHash,
        generatedAt,
        expiresAt,
      },
      update: {
        headlineJson: serializeHeadlineJson(output.headline),
        narrative: output.narrative,
        source: "llm_enriched",
        factsHash,
        generatedAt,
        expiresAt,
      },
    });

    await prisma.activityEvent.create({
      data: {
        organizationId,
        type: "executive_briefing.enriched",
        title: "Executive briefing headline enriched",
        description: output.narrative.slice(0, 280),
        metadataJson: JSON.stringify({
          source: "llm_enriched",
          generatedAt: generatedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        action: "executive_briefing.enriched",
        entityType: "ExecutiveBriefingSnapshot",
        entityId: organizationId,
        metadataJson: JSON.stringify({
          factsHash,
          generatedAt: generatedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }),
      },
    });

    return {
      status: "enriched",
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return { status: "failed", error: message };
  }
}
