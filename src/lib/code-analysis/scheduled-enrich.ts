import { prisma } from "@/lib/prisma";
import { enrichCodeAnalysisForOrg } from "@/lib/code-analysis/enrich";
import { isCodeAnalysisEnrichEnabled } from "@/lib/code-analysis/enrich-config";

export type ScheduledCodeAnalysisEnrichOrgResult = {
  organizationId: string;
  status: "enriched" | "skipped" | "failed";
  reason?: string;
  error?: string;
  scored?: number;
};

export async function runScheduledCodeAnalysisEnrich(input?: {
  organizationId?: string;
}): Promise<{
  attempted: number;
  enriched: number;
  skipped: number;
  failed: number;
  results: ScheduledCodeAnalysisEnrichOrgResult[];
}> {
  if (!isCodeAnalysisEnrichEnabled()) {
    return {
      attempted: 0,
      enriched: 0,
      skipped: 0,
      failed: 0,
      results: [
        {
          organizationId: input?.organizationId ?? "all",
          status: "skipped",
          reason: "enrich_disabled",
        },
      ],
    };
  }

  const orgIds = input?.organizationId
    ? [input.organizationId]
    : (
        await prisma.codeAnalysisRun.findMany({
          distinct: ["organizationId"],
          select: { organizationId: true },
          orderBy: { organizationId: "asc" },
        })
      ).map((row) => row.organizationId);

  const results: ScheduledCodeAnalysisEnrichOrgResult[] = [];

  for (const organizationId of orgIds) {
    try {
      const result = await enrichCodeAnalysisForOrg(organizationId);
      if (result.status === "enriched") {
        results.push({
          organizationId,
          status: "enriched",
          scored: result.scored,
        });
      } else if (result.status === "skipped") {
        results.push({
          organizationId,
          status: "skipped",
          reason: result.reason,
        });
      } else {
        results.push({
          organizationId,
          status: "failed",
          error: result.error,
        });
      }
    } catch (error) {
      results.push({
        organizationId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    attempted: orgIds.length,
    enriched: results.filter((r) => r.status === "enriched").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}
