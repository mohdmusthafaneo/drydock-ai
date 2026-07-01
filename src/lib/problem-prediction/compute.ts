import { Prisma } from "@/generated/prisma/client";
import { loadStoredCodeAnalysisFromDb } from "@/lib/code-analysis/persist";
import { loadDeliveryAnalysisHistory } from "@/lib/delivery-analysis/persist";
import { indicatorsForCatalog } from "@/lib/problem-prediction/indicators";
import type { PredictionCandidate } from "@/lib/problem-prediction/types";
import { prisma } from "@/lib/prisma";

const HISTORY_DAYS = 90;
const TELEMETRY_DAYS = 30;

function isMissingProblemPredictionTables(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.message.includes("ProblemPrediction"))
  );
}

function sinceDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function computePredictions(
  organizationId: string,
): Promise<PredictionCandidate[]> {
  try {
    return await computePredictionsInner(organizationId);
  } catch (error) {
    if (isMissingProblemPredictionTables(error)) return [];
    throw error;
  }
}

async function computePredictionsInner(
  organizationId: string,
): Promise<PredictionCandidate[]> {
  const sinceTelemetry = sinceDate(TELEMETRY_DAYS);
  const sinceIncidents = sinceDate(HISTORY_DAYS);

  const [
    deliveryHistory,
    codeAnalysis,
    complianceFindings,
    telemetryMetrics,
    deploymentEvents,
    incidents,
  ] = await Promise.all([
    loadDeliveryAnalysisHistory(organizationId, "90d"),
    loadStoredCodeAnalysisFromDb(organizationId),
    prisma.complianceFinding.findMany({
      where: { organizationId },
      select: {
        severity: true,
        status: true,
        ruleKey: true,
        projectKey: true,
        firstSeenAt: true,
      },
    }),
    prisma.telemetryMetric.findMany({
      where: { organizationId, recordedAt: { gte: sinceTelemetry } },
      orderBy: { recordedAt: "asc" },
      select: { metricKey: true, value: true, recordedAt: true },
    }),
    prisma.deploymentEvent.findMany({
      where: { organizationId, deployedAt: { gte: sinceTelemetry } },
      orderBy: { deployedAt: "asc" },
      select: { health: true, healthScore: true, deployedAt: true },
    }),
    prisma.incident.findMany({
      where: { organizationId, detectedAt: { gte: sinceIncidents } },
      orderBy: { detectedAt: "asc" },
      select: { severityScore: true, status: true, detectedAt: true },
    }),
  ]);

  const hasSignals =
    deliveryHistory.length >= 2 ||
    codeAnalysis !== null ||
    complianceFindings.length > 0 ||
    telemetryMetrics.length > 0 ||
    deploymentEvents.length > 0 ||
    incidents.length > 0;

  if (!hasSignals) return [];

  const ctx = {
    deliveryHistory,
    codeAnalysis,
    complianceFindings,
    telemetryMetrics,
    deploymentEvents,
    incidents,
  };

  const indicators = indicatorsForCatalog();
  return indicators.flatMap((indicator) => indicator.evaluate(ctx));
}
