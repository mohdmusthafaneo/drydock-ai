import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisKpis,
  DeliveryAnalysisProjectRow,
  DeliveryAnalysisSnapshot,
  DeliveryAnalysisSprintRow,
  DeliveryAnalysisVersionRow,
} from "@/lib/delivery-analysis/types";
import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import {
  analyzePortfolioDeliveryHealth,
  type JiraDeliveryGap,
  type JiraDeliverySignal,
} from "@/lib/jira-delivery-health";

type SnapshotProject = DeliveryAnalysisProjectRow & {
  versions: Omit<DeliveryAnalysisVersionRow, "projectKey" | "projectName">[];
  sprint?: Omit<DeliveryAnalysisSprintRow, "projectKey" | "projectName">;
};

export function filterSnapshotProjects(
  projects: SnapshotProject[],
  filters: DeliveryAnalysisFilters,
): SnapshotProject[] {
  if (filters.projectKey) {
    return projects.filter((p) => p.key === filters.projectKey);
  }
  return projects;
}

function sprintSeverity(pct: number): DeliveryAnalysisSprintRow["severity"] {
  if (pct < 40) return "critical";
  if (pct < 60) return "warning";
  return "info";
}

function jiraProjectsToSnapshotRows(
  jiraSnapshot: JiraDeliverySnapshot,
  projectKey: string | null,
): SnapshotProject[] {
  const projects = projectKey
    ? jiraSnapshot.projects.filter((p) => p.key === projectKey)
    : jiraSnapshot.projects;

  return projects.map((p) => {
    const health = analyzePortfolioDeliveryHealth({
      snapshot: jiraSnapshot,
      projectKey: p.key,
    });

    const sprint = p.activeSprint;
    let sprintRow: SnapshotProject["sprint"];
    let activeSprint: DeliveryAnalysisProjectRow["activeSprint"];

    if (sprint && sprint.committed != null && sprint.committed > 0) {
      const done = sprint.done ?? 0;
      const pct = Math.round((done / sprint.committed) * 100);
      activeSprint = {
        name: sprint.name,
        done,
        committed: sprint.committed,
        pct,
      };
      sprintRow = {
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        done,
        committed: sprint.committed,
        pct,
        severity: sprintSeverity(pct),
      };
    }

    return {
      key: p.key,
      name: p.name,
      healthScore: health.score,
      openIssues: p.openIssues,
      blockedCount: p.blockedCount,
      overdueCount: p.overdueCount,
      bugsOpen: p.bugsOpen,
      activeSprint,
      versions: p.versions.map((v) => ({
        id: v.id,
        name: v.name,
        released: v.released,
        releaseDate: v.releaseDate,
        overdue: v.overdue,
      })),
      sprint: sprintRow,
    };
  });
}

export function computeDeliveryAnalysisFromJira(input: {
  jiraSnapshot: JiraDeliverySnapshot;
  siteUrl?: string;
  filters: DeliveryAnalysisFilters;
}): DeliveryAnalysisSnapshot {
  const allRows = jiraProjectsToSnapshotRows(input.jiraSnapshot, null);
  const health = analyzePortfolioDeliveryHealth({
    snapshot: input.jiraSnapshot,
    projectKey: input.filters.projectKey,
  });

  return computeDeliveryAnalysisSnapshot({
    projects: filterSnapshotProjects(allRows, input.filters),
    filters: input.filters,
    siteUrl: input.siteUrl ?? "",
    generatedAt: input.jiraSnapshot.syncedAt,
    signals: health.signals,
    gaps: health.gaps,
    trend: [],
    portfolioHealthScore: health.score,
  });
}

export function snapshotForFilters(
  jiraSnapshot: JiraDeliverySnapshot,
  siteUrl: string | undefined,
  filters: DeliveryAnalysisFilters,
): DeliveryAnalysisSnapshot {
  return computeDeliveryAnalysisFromJira({
    jiraSnapshot,
    siteUrl,
    filters,
  });
}

export function computeDeliveryAnalysisSnapshot(input: {
  projects: SnapshotProject[];
  filters: DeliveryAnalysisFilters;
  siteUrl: string;
  generatedAt: string;
  signals: JiraDeliverySignal[];
  gaps: JiraDeliveryGap[];
  trend: DeliveryAnalysisSnapshot["trend"];
  kpisDeltas?: Partial<DeliveryAnalysisKpis>;
  portfolioHealthScore?: number;
}): DeliveryAnalysisSnapshot {
  const {
    projects,
    filters,
    siteUrl,
    generatedAt,
    signals,
    gaps,
    trend,
    kpisDeltas,
    portfolioHealthScore,
  } = input;

  const openWork = projects.reduce((n, p) => n + p.openIssues, 0);
  const blocked = projects.reduce((n, p) => n + p.blockedCount, 0);
  const overdue = projects.reduce((n, p) => n + p.overdueCount, 0);
  const bugsOpen = projects.reduce((n, p) => n + p.bugsOpen, 0);
  const otherOpen = Math.max(0, openWork - blocked - overdue);

  const healthScore =
    portfolioHealthScore ??
    (projects.length > 0
      ? Math.round(projects.reduce((n, p) => n + p.healthScore, 0) / projects.length)
      : 0);

  const sprintRows: DeliveryAnalysisSprintRow[] = projects
    .filter((p) => p.sprint)
    .map((p) => ({
      projectKey: p.key,
      projectName: p.name,
      ...p.sprint!,
    }));

  const sprintCompletionPct =
    sprintRows.length > 0
      ? Math.round(sprintRows.reduce((n, s) => n + s.pct, 0) / sprintRows.length)
      : null;

  const versions: DeliveryAnalysisVersionRow[] = projects.flatMap((p) =>
    p.versions.map((v) => ({
      projectKey: p.key,
      projectName: p.name,
      ...v,
    })),
  );

  const rangeLabels: Record<DeliveryAnalysisFilters["range"], string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
  };

  let filteredSignals = signals;
  if (filters.riskFocus !== "all") {
    const focus = filters.riskFocus;
    filteredSignals = signals.filter((s) => s.category === focus);
  }

  if (filters.projectKey) {
    filteredSignals = filteredSignals.filter((s) =>
      s.value.toLowerCase().includes(filters.projectKey!.toLowerCase()),
    );
  }

  return {
    generatedAt,
    projectKeys: projects.map((p) => p.key),
    siteUrl,
    rangeLabel: rangeLabels[filters.range],
    kpis: {
      healthScore,
      healthScoreDelta: kpisDeltas?.healthScoreDelta,
      openWork,
      openWorkDelta: kpisDeltas?.openWorkDelta,
      blocked,
      blockedDelta: kpisDeltas?.blockedDelta,
      overdue,
      overdueDelta: kpisDeltas?.overdueDelta,
      bugsOpen,
      sprintCompletionPct,
    },
    riskMix: { blocked, overdue, bugs: bugsOpen, otherOpen },
    trend,
    byProject: projects.map(({ versions: _v, sprint: _s, ...row }) => row),
    versions,
    sprints: sprintRows,
    signals: filteredSignals,
    gaps,
  };
}

/** @deprecated Use filterSnapshotProjects */
export const filterMockProjects = filterSnapshotProjects;
