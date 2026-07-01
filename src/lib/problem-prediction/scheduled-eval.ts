import { prisma } from "@/lib/prisma";
import { evaluateProblemPredictions } from "@/lib/problem-prediction/persist";
import type { PersistPredictionsResult } from "@/lib/problem-prediction/types";

export type ScheduledPredictionEvalOrgResult = {
  organizationId: string;
  status: "evaluated" | "skipped" | "failed";
  reason?: string;
  error?: string;
  result?: PersistPredictionsResult;
};

async function loadOrganizationIdsForPredictionEval(): Promise<string[]> {
  const [delivery, code, compliance, telemetry, deploy, incident] = await Promise.all([
    prisma.deliveryAnalysisSnapshot.findMany({
      distinct: ["organizationId"],
      select: { organizationId: true },
    }),
    prisma.codeAnalysisRun.findMany({
      distinct: ["organizationId"],
      select: { organizationId: true },
    }),
    prisma.complianceFinding.findMany({
      distinct: ["organizationId"],
      select: { organizationId: true },
    }),
    prisma.telemetryMetric.findMany({
      distinct: ["organizationId"],
      select: { organizationId: true },
    }),
    prisma.deploymentEvent.findMany({
      distinct: ["organizationId"],
      select: { organizationId: true },
    }),
    prisma.incident.findMany({
      distinct: ["organizationId"],
      select: { organizationId: true },
    }),
  ]);

  return [
    ...new Set([
      ...delivery.map((r) => r.organizationId),
      ...code.map((r) => r.organizationId),
      ...compliance.map((r) => r.organizationId),
      ...telemetry.map((r) => r.organizationId),
      ...deploy.map((r) => r.organizationId),
      ...incident.map((r) => r.organizationId),
    ]),
  ].sort();
}

export async function runScheduledPredictionEval(input?: {
  organizationId?: string;
}): Promise<{
  attempted: number;
  evaluated: number;
  skipped: number;
  failed: number;
  results: ScheduledPredictionEvalOrgResult[];
}> {
  const orgIds = input?.organizationId
    ? [input.organizationId]
    : await loadOrganizationIdsForPredictionEval();

  const results: ScheduledPredictionEvalOrgResult[] = [];

  for (const organizationId of orgIds) {
    try {
      const result = await evaluateProblemPredictions(organizationId);
      results.push({
        organizationId,
        status: result.status === "evaluated" ? "evaluated" : "skipped",
        reason: result.reason,
        result,
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
