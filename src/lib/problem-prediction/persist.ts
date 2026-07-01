import { Prisma } from "@/generated/prisma/client";
import { enqueuePredictionEvaluatedWakeups } from "@/lib/agent-control-plane/prediction-wakeups";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { computePredictions } from "@/lib/problem-prediction/compute";
import { indicatorsForCatalog } from "@/lib/problem-prediction/indicators";
import type {
  PersistPredictionsResult,
  PredictionCandidate,
} from "@/lib/problem-prediction/types";
import { prisma } from "@/lib/prisma";

function isMissingProblemPredictionTables(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.message.includes("ProblemPrediction"))
  );
}

export async function persistPredictions(
  organizationId: string,
  candidates?: PredictionCandidate[],
): Promise<PersistPredictionsResult> {
  try {
    return await persistPredictionsInner(organizationId, candidates);
  } catch (error) {
    if (isMissingProblemPredictionTables(error)) {
      return {
        status: "skipped",
        reason: "problem_prediction_tables_missing",
        triggered: 0,
        created: 0,
        updated: 0,
        resolved: 0,
        reopened: 0,
      };
    }
    throw error;
  }
}

async function persistPredictionsInner(
  organizationId: string,
  candidates?: PredictionCandidate[],
): Promise<PersistPredictionsResult> {
  const resolvedCandidates = candidates ?? (await computePredictions(organizationId));

  if (
    resolvedCandidates.length === 0 &&
    !(await hasAnyPredictionDataSource(organizationId))
  ) {
    return {
      status: "skipped",
      reason: "no_prediction_data",
      triggered: 0,
      created: 0,
      updated: 0,
      resolved: 0,
      reopened: 0,
    };
  }

  const indicatorKeys = new Set(indicatorsForCatalog().map((i) => i.key));
  const activeKeys = new Set(resolvedCandidates.map((c) => c.key));
  const now = new Date();

  let created = 0;
  let updated = 0;
  let reopened = 0;
  let newCritical = 0;

  for (const candidate of resolvedCandidates) {
    const existing = await prisma.problemPrediction.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: candidate.key,
        },
      },
    });

    if (!existing) {
      await prisma.problemPrediction.create({
        data: {
          organizationId,
          key: candidate.key,
          domain: candidate.domain,
          severity: candidate.severity,
          horizon: candidate.horizon,
          confidence: candidate.confidence,
          status: "open",
          rationale: candidate.rationale,
          signalsJson: JSON.stringify(candidate.signals),
          projectKey: candidate.projectKey ?? null,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      created += 1;
      if (candidate.severity === "critical") newCritical += 1;
      continue;
    }

    if (existing.status === "resolved") {
      await prisma.problemPrediction.update({
        where: { id: existing.id },
        data: {
          status: "open",
          resolvedAt: null,
          lastSeenAt: now,
          domain: candidate.domain,
          severity: candidate.severity,
          horizon: candidate.horizon,
          confidence: candidate.confidence,
          rationale: candidate.rationale,
          signalsJson: JSON.stringify(candidate.signals),
          projectKey: candidate.projectKey ?? null,
        },
      });
      reopened += 1;
      if (candidate.severity === "critical") newCritical += 1;
      continue;
    }

    await prisma.problemPrediction.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        domain: candidate.domain,
        severity: candidate.severity,
        horizon: candidate.horizon,
        confidence: candidate.confidence,
        rationale: candidate.rationale,
        signalsJson: JSON.stringify(candidate.signals),
        projectKey: candidate.projectKey ?? null,
      },
    });
    updated += 1;
  }

  const openPredictions = await prisma.problemPrediction.findMany({
    where: {
      organizationId,
      status: "open",
    },
    select: { id: true, key: true },
  });

  const toResolve = openPredictions.filter((row) => {
    const indicatorKey = row.key.split(":")[0] ?? "";
    if (!indicatorKeys.has(indicatorKey)) return false;
    return !activeKeys.has(row.key);
  });

  let resolved = 0;
  if (toResolve.length > 0) {
    const result = await prisma.problemPrediction.updateMany({
      where: { id: { in: toResolve.map((r) => r.id) } },
      data: {
        status: "resolved",
        resolvedAt: now,
      },
    });
    resolved = result.count;
  }

  const changed = created + updated + resolved + reopened > 0;
  if (changed) {
    invalidateExecutiveBriefingSnapshot(organizationId);
  }

  if (newCritical > 0) {
    await prisma.activityEvent.create({
      data: {
        organizationId,
        type: "prediction.critical",
        title: "Critical problem predictions",
        description: `${newCritical} new or reopened critical prediction${newCritical === 1 ? "" : "s"} detected.`,
        metadataJson: JSON.stringify({ newCritical }),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: null,
        action: "prediction.evaluated",
        entityType: "Organization",
        entityId: organizationId,
        metadataJson: JSON.stringify({
          created,
          updated,
          resolved,
          reopened,
          newCritical,
        }),
      },
    });

    void enqueuePredictionEvaluatedWakeups(organizationId, {
      newCritical,
      batchKey: organizationId,
    }).catch((error) => {
      console.error("[prediction] failed to enqueue agent wakeup", error);
    });
  }

  return {
    status: "evaluated",
    triggered: resolvedCandidates.length,
    created,
    updated,
    resolved,
    reopened,
  };
}

async function hasAnyPredictionDataSource(organizationId: string): Promise<boolean> {
  const [delivery, codeRun, compliance, telemetry, deploy, incident] =
    await Promise.all([
      prisma.deliveryAnalysisSnapshot.findFirst({
        where: { organizationId },
        select: { id: true },
      }),
      prisma.codeAnalysisRun.findFirst({
        where: { organizationId },
        select: { id: true },
      }),
      prisma.complianceFinding.findFirst({
        where: { organizationId },
        select: { id: true },
      }),
      prisma.telemetryMetric.findFirst({
        where: { organizationId },
        select: { id: true },
      }),
      prisma.deploymentEvent.findFirst({
        where: { organizationId },
        select: { id: true },
      }),
      prisma.incident.findFirst({
        where: { organizationId },
        select: { id: true },
      }),
    ]);

  return Boolean(delivery || codeRun || compliance || telemetry || deploy || incident);
}

export async function evaluateProblemPredictions(
  organizationId: string,
): Promise<PersistPredictionsResult> {
  return persistPredictions(organizationId);
}
