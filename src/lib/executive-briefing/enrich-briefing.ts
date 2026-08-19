import { getMastra } from "@/mastra";
import { prisma } from "@/lib/prisma";
import { resolveStoredJiraDelivery } from "@/lib/delivery-analysis/resolve";
import { loadExecutiveBriefing } from "@/lib/executive-briefing/load-briefing-context";
import { extractDeliveryDiagnosticFacts } from "@/lib/executive-briefing/delivery-diagnostic";
import { summarizePortfolioHygiene } from "@/lib/jira-hygiene";
import {
  computeBriefingFactsHash,
  getBriefingEnrichIntervalSec,
  isBriefingEnrichEnabled,
  serializeHeadlineJson,
} from "@/lib/executive-briefing/snapshot-utils";
import { runMeteredLlmCall } from "@/lib/llm/cost-governor";
import { isLlmFeatureEnabled } from "@/lib/llm/feature-flags";
import { determineActorType } from "@/lib/audit-helpers";

export type EnrichExecutiveBriefingResult =
  | { status: "enriched"; generatedAt: string; expiresAt: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

function buildFactsJson(
  briefing: Awaited<ReturnType<typeof loadExecutiveBriefing>>["briefing"],
  orgName: string,
  options: {
    jiraHygiene?: {
      portfolioScore: number;
      degradesTrust: boolean;
      worstProject?: { key: string; name: string };
      topFindings: { id: string; label: string; value: string; severity: string }[];
    } | null;
    deliveryDiagnostic?: ReturnType<typeof extractDeliveryDiagnosticFacts> | null;
    deliverySnapshot?: Awaited<
      ReturnType<typeof loadExecutiveBriefing>
    >["deliverySnapshot"];
  },
): string {
  const kpis = options.deliverySnapshot?.kpis;
  return JSON.stringify(
    {
      orgName,
      health: briefing.health,
      claims: briefing.claims,
      highlights: briefing.highlights,
      insight: briefing.insight ?? null,
      freshness: briefing.freshness,
      meta: briefing.meta,
      jiraHygiene: options.jiraHygiene ?? null,
      delivery: {
        diagnostic: options.deliveryDiagnostic ?? null,
        kpis: kpis
          ? {
              blocked: kpis.blocked,
              overdue: kpis.overdue,
              spillover: kpis.spillover ?? null,
              spilloverDelta: kpis.spilloverDelta ?? null,
              bugsOpen: kpis.bugsOpen ?? null,
              openWork: kpis.openWork,
              openWorkDelta: kpis.openWorkDelta ?? null,
              reopened: kpis.reopened ?? null,
              sprintCompletionPct: kpis.sprintCompletionPct ?? null,
              resolvedLast7d: kpis.resolvedLast7d ?? null,
              scopeLabel: kpis.scopeLabel ?? null,
            }
          : null,
        riskMix: options.deliverySnapshot?.riskMix ?? null,
        primarySprint: options.deliverySnapshot?.sprints?.[0]
          ? {
              name: options.deliverySnapshot.sprints[0].name,
              pct: options.deliverySnapshot.sprints[0].pct,
              done: options.deliverySnapshot.sprints[0].done,
              committed: options.deliverySnapshot.sprints[0].committed,
              endDate: options.deliverySnapshot.sprints[0].endDate ?? null,
            }
          : null,
      },
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

  const { briefing, orgName, deliverySnapshot, effectiveMapping } =
    await loadExecutiveBriefing(organizationId, {
      applyLlmSnapshot: false,
    });

  const jiraStored = await resolveStoredJiraDelivery(organizationId);
  const jiraHygieneFacts = summarizePortfolioHygiene(jiraStored?.jiraHygiene);
  const deliveryDiagnostic = extractDeliveryDiagnosticFacts({
    deliverySnapshot,
    jiraSnapshot: jiraStored?.snapshot ?? null,
    mapping: effectiveMapping,
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

  const factsJson = buildFactsJson(briefing, orgName, {
    jiraHygiene: jiraHygieneFacts,
    deliveryDiagnostic,
    deliverySnapshot,
  });

  try {
    const metered = await runMeteredLlmCall({
      organizationId,
      feature: "executive_briefing",
      cacheKeyParts: { factsHash },
      estimatedPromptTokens: 2500,
      modelTier: "default",
      execute: async () => {
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
          throw new Error(`workflow_${workflowResult.status}`);
        }

        return {
          result: workflowResult.result,
          promptTokens: 2500,
          completionTokens: 600,
        };
      },
    });

    if (metered.status === "skipped") {
      return {
        status: "skipped",
        reason:
          metered.reason === "budget_exceeded"
            ? "llm_budget_exceeded"
            : "llm_feature_disabled",
      };
    }

    const output = metered.result;
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
          meteredCached: metered.cached,
          meteredModel: metered.model,
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
        actorType: determineActorType(undefined, "executive_briefing.enriched"),
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
