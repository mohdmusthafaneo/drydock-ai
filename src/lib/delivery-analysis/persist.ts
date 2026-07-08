import { Prisma } from "@/generated/prisma/client";
import { computeDeliveryAnalysisFromJira } from "@/lib/delivery-analysis/compute-snapshot";
import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisKpis,
  DeliveryAnalysisSnapshot,
  DeliveryAnalysisTrendPoint,
  TimeRange,
} from "@/lib/delivery-analysis/types";
import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import { prisma } from "@/lib/prisma";
import { resolveEffectiveToolchainMapping } from "@/lib/toolchain-mapping";

const HISTORY_WINDOW_DAYS = 90;

const DEFAULT_FILTERS: DeliveryAnalysisFilters = {
  projectKey: null,
  riskFocus: "all",
  range: "30d",
  compare: "previous_sync",
};

function isMissingDeliveryAnalysisTables(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.message.includes("DeliveryAnalysisSnapshot"))
  );
}

/** Stale dev server or migration not applied — Prisma client has no history delegate. */
function isDeliveryAnalysisHistoryUnavailable(error: unknown): boolean {
  if (isMissingDeliveryAnalysisTables(error)) return true;
  return (
    error instanceof TypeError &&
    String(error.message).includes("findMany") &&
    String(error.message).includes("undefined")
  );
}

function deliveryAnalysisSnapshotClient():
  | Pick<typeof prisma.deliveryAnalysisSnapshot, "findMany" | "create" | "deleteMany">
  | null {
  const delegate = (
    prisma as { deliveryAnalysisSnapshot?: typeof prisma.deliveryAnalysisSnapshot }
  ).deliveryAnalysisSnapshot;
  if (!delegate || typeof delegate.findMany !== "function") return null;
  return delegate;
}

function sinceDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function rangeToDays(range: TimeRange): number {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  return 90;
}

function parseSnapshotJson(json: string): DeliveryAnalysisSnapshot | null {
  try {
    return JSON.parse(json) as DeliveryAnalysisSnapshot;
  } catch {
    return null;
  }
}

export function scopedKpisFromSnapshot(
  snapshot: DeliveryAnalysisSnapshot,
  projectKey: string | null,
): Pick<DeliveryAnalysisKpis, "healthScore" | "openWork" | "blocked" | "overdue"> {
  if (!projectKey) {
    return {
      healthScore: snapshot.kpis.healthScore,
      openWork: snapshot.kpis.openWork,
      blocked: snapshot.kpis.blocked,
      overdue: snapshot.kpis.overdue,
    };
  }

  const row = snapshot.byProject.find((p) => p.key === projectKey);
  if (!row) {
    return { healthScore: 0, openWork: 0, blocked: 0, overdue: 0 };
  }

  return {
    healthScore: row.healthScore,
    openWork: row.openIssues,
    blocked: row.blockedCount,
    overdue: row.overdueCount,
  };
}

export function trendPointFromRow(
  syncedAt: Date,
  snapshotJson: string,
  projectKey: string | null,
): DeliveryAnalysisTrendPoint | null {
  const snapshot = parseSnapshotJson(snapshotJson);
  if (!snapshot) return null;

  const kpis = scopedKpisFromSnapshot(snapshot, projectKey);
  return {
    syncedAt: syncedAt.toISOString(),
    healthScore: kpis.healthScore,
    openWork: kpis.openWork,
    blocked: kpis.blocked,
    overdue: kpis.overdue,
  };
}

export function computeKpiDeltas(
  current: Pick<DeliveryAnalysisKpis, "healthScore" | "openWork" | "blocked" | "overdue">,
  prior: Pick<DeliveryAnalysisKpis, "healthScore" | "openWork" | "blocked" | "overdue">,
): Pick<
  DeliveryAnalysisKpis,
  "healthScoreDelta" | "openWorkDelta" | "blockedDelta" | "overdueDelta"
> {
  return {
    healthScoreDelta: current.healthScore - prior.healthScore,
    openWorkDelta: current.openWork - prior.openWork,
    blockedDelta: current.blocked - prior.blocked,
    overdueDelta: current.overdue - prior.overdue,
  };
}

export async function loadDeliveryAnalysisHistory(
  organizationId: string,
  range: TimeRange,
): Promise<
  Array<{
    syncedAt: Date;
    snapshotJson: string;
    healthScore: number;
    openWork: number;
  }>
> {
  try {
    return await loadDeliveryAnalysisHistoryInner(organizationId, range);
  } catch (error) {
    if (isDeliveryAnalysisHistoryUnavailable(error)) return [];
    throw error;
  }
}

async function loadDeliveryAnalysisHistoryInner(
  organizationId: string,
  range: TimeRange,
): Promise<
  Array<{
    syncedAt: Date;
    snapshotJson: string;
    healthScore: number;
    openWork: number;
  }>
> {
  const since = sinceDate(rangeToDays(range));
  const client = deliveryAnalysisSnapshotClient();
  if (!client) return [];

  return client.findMany({
    where: {
      organizationId,
      syncedAt: { gte: since },
    },
    orderBy: { syncedAt: "asc" },
    select: {
      syncedAt: true,
      snapshotJson: true,
      healthScore: true,
      openWork: true,
    },
  });
}

export function buildTrendFromHistory(
  rows: Array<{ syncedAt: Date; snapshotJson: string }>,
  projectKey: string | null,
): DeliveryAnalysisTrendPoint[] {
  const points: DeliveryAnalysisTrendPoint[] = [];
  for (const row of rows) {
    const point = trendPointFromRow(row.syncedAt, row.snapshotJson, projectKey);
    if (point) points.push(point);
  }
  return points;
}

export function priorKpisFromHistory(
  rows: Array<{ syncedAt: Date; snapshotJson: string }>,
  projectKey: string | null,
): Pick<DeliveryAnalysisKpis, "healthScore" | "openWork" | "blocked" | "overdue"> | null {
  if (rows.length < 2) return null;
  const priorRow = rows[rows.length - 2];
  const snapshot = parseSnapshotJson(priorRow.snapshotJson);
  if (!snapshot) return null;
  return scopedKpisFromSnapshot(snapshot, projectKey);
}

export async function persistDeliveryAnalysisSnapshot(input: {
  organizationId: string;
  integrationId: string;
  jiraSnapshot: JiraDeliverySnapshot;
  siteUrl?: string;
  syncedAt: Date;
}): Promise<DeliveryAnalysisSnapshot | null> {
  try {
    return await persistDeliveryAnalysisSnapshotInner(input);
  } catch (error) {
    if (isDeliveryAnalysisHistoryUnavailable(error)) return null;
    throw error;
  }
}

async function persistDeliveryAnalysisSnapshotInner(input: {
  organizationId: string;
  integrationId: string;
  jiraSnapshot: JiraDeliverySnapshot;
  siteUrl?: string;
  syncedAt: Date;
}): Promise<DeliveryAnalysisSnapshot> {
  const mapping = await resolveEffectiveToolchainMapping(input.organizationId);
  const rollup = computeDeliveryAnalysisFromJira({
    jiraSnapshot: input.jiraSnapshot,
    siteUrl: input.siteUrl,
    filters: DEFAULT_FILTERS,
    mapping: mapping ?? undefined,
    releaseTracking: mapping?.jira?.releaseTracking,
  });

  const storedSnapshot: DeliveryAnalysisSnapshot = {
    ...rollup,
    trend: [],
    kpis: {
      ...rollup.kpis,
      healthScoreDelta: undefined,
      openWorkDelta: undefined,
      blockedDelta: undefined,
      overdueDelta: undefined,
    },
  };

  const client = deliveryAnalysisSnapshotClient();
  if (!client) return storedSnapshot;

  await prisma.$transaction(async (tx) => {
    const history = (
      tx as { deliveryAnalysisSnapshot?: typeof prisma.deliveryAnalysisSnapshot }
    ).deliveryAnalysisSnapshot;
    if (!history) return;

    await history.create({
      data: {
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        healthScore: storedSnapshot.kpis.healthScore,
        openWork: storedSnapshot.kpis.openWork,
        blocked: storedSnapshot.kpis.blocked,
        overdue: storedSnapshot.kpis.overdue,
        bugsOpen: storedSnapshot.kpis.bugsOpen ?? 0,
        projectKeysJson: JSON.stringify(storedSnapshot.projectKeys),
        snapshotJson: JSON.stringify(storedSnapshot),
        syncedAt: input.syncedAt,
      },
    });

    const cutoff = sinceDate(HISTORY_WINDOW_DAYS);
    await history.deleteMany({
      where: {
        organizationId: input.organizationId,
        syncedAt: { lt: cutoff },
      },
    });
  });

  return storedSnapshot;
}

export async function pruneOldDeliveryAnalysisHistory(organizationId: string): Promise<void> {
  try {
    const cutoff = sinceDate(HISTORY_WINDOW_DAYS);
    const client = deliveryAnalysisSnapshotClient();
    if (!client) return;
    await client.deleteMany({
      where: {
        organizationId,
        syncedAt: { lt: cutoff },
      },
    });
  } catch (error) {
    if (isDeliveryAnalysisHistoryUnavailable(error)) return;
    throw error;
  }
}
