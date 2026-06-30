import { prisma } from "@/lib/prisma";
import { evaluateCompliance } from "@/lib/compliance/evaluate";
import type { EvaluateComplianceResult } from "@/lib/compliance/types";

export type ScheduledComplianceEvalOrgResult = {
  organizationId: string;
  status: "evaluated" | "skipped" | "failed";
  reason?: string;
  error?: string;
  sync?: EvaluateComplianceResult;
  enrich?: EvaluateComplianceResult;
};

export async function runScheduledComplianceEval(input?: {
  organizationId?: string;
}): Promise<{
  attempted: number;
  evaluated: number;
  skipped: number;
  failed: number;
  results: ScheduledComplianceEvalOrgResult[];
}> {
  const orgIds = input?.organizationId
    ? [input.organizationId]
    : (
        await prisma.codeAnalysisRun.findMany({
          distinct: ["organizationId"],
          select: { organizationId: true },
          orderBy: { organizationId: "asc" },
        })
      ).map((row) => row.organizationId);

  const results: ScheduledComplianceEvalOrgResult[] = [];

  for (const organizationId of orgIds) {
    try {
      const sync = await evaluateCompliance(organizationId, "sync");
      const enrich = await evaluateCompliance(organizationId, "enrich");
      const evaluated = sync.status === "evaluated" || enrich.status === "evaluated";
      const skipped = sync.status === "skipped" && enrich.status === "skipped";

      results.push({
        organizationId,
        status: evaluated ? "evaluated" : skipped ? "skipped" : "evaluated",
        reason: skipped ? sync.reason ?? enrich.reason : undefined,
        sync,
        enrich,
      });
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
    evaluated: results.filter((r) => r.status === "evaluated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}
