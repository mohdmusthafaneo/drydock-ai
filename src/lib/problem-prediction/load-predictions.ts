import { prisma } from "@/lib/prisma";
import type {
  PredictionDomain,
  PredictionHorizon,
  PredictionSeverity,
  PredictionStatus,
  PredictionSummary,
  PredictionView,
} from "@/lib/problem-prediction/types";

function parseSignalsJson(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function rowToView(row: {
  id: string;
  key: string;
  domain: string;
  severity: string;
  horizon: string;
  confidence: number;
  status: string;
  rationale: string;
  signalsJson: string;
  projectKey: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
}): PredictionView {
  return {
    id: row.id,
    key: row.key,
    domain: row.domain as PredictionDomain,
    severity: row.severity as PredictionSeverity,
    horizon: row.horizon as PredictionHorizon,
    confidence: row.confidence,
    status: row.status as PredictionStatus,
    rationale: row.rationale,
    signals: parseSignalsJson(row.signalsJson),
    projectKey: row.projectKey,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export async function loadProblemPredictions(
  organizationId: string,
  filters?: {
    status?: PredictionStatus;
    severity?: PredictionSeverity;
    domain?: PredictionDomain;
    projectKey?: string;
    limit?: number;
  },
): Promise<PredictionView[]> {
  const rows = await prisma.problemPrediction.findMany({
    where: {
      organizationId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.severity ? { severity: filters.severity } : {}),
      ...(filters?.domain ? { domain: filters.domain } : {}),
      ...(filters?.projectKey ? { projectKey: filters.projectKey } : {}),
    },
    orderBy: [
      { status: "asc" },
      { severity: "asc" },
      { confidence: "desc" },
      { lastSeenAt: "desc" },
    ],
    take: filters?.limit ?? 100,
  });

  return rows.map(rowToView);
}

export async function loadPredictionSummary(
  organizationId: string,
): Promise<PredictionSummary> {
  const [openPredictions, latest] = await Promise.all([
    prisma.problemPrediction.findMany({
      where: { organizationId, status: "open" },
      select: { severity: true },
    }),
    prisma.problemPrediction.findFirst({
      where: { organizationId },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    }),
  ]);

  let criticalOpen = 0;
  let warningOpen = 0;
  let infoOpen = 0;

  for (const prediction of openPredictions) {
    if (prediction.severity === "critical") criticalOpen += 1;
    else if (prediction.severity === "warning") warningOpen += 1;
    else infoOpen += 1;
  }

  return {
    openCount: openPredictions.length,
    criticalOpen,
    warningOpen,
    infoOpen,
    lastEvaluatedAt: latest?.lastSeenAt.toISOString() ?? null,
  };
}
