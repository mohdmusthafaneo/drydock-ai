import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisKpis,
  DeliveryAnalysisProjectRow,
  DeliveryAnalysisSnapshot,
  DeliveryAnalysisSprintRow,
  DeliveryAnalysisVersionRow,
} from "@/lib/delivery-analysis/types";
import type { JiraDeliveryGap, JiraDeliverySignal } from "@/lib/jira-delivery-health";

type MockProject = DeliveryAnalysisProjectRow & {
  versions: Omit<DeliveryAnalysisVersionRow, "projectKey" | "projectName">[];
  sprint?: Omit<DeliveryAnalysisSprintRow, "projectKey" | "projectName">;
};

export function filterMockProjects(
  projects: MockProject[],
  filters: DeliveryAnalysisFilters,
): MockProject[] {
  if (filters.projectKey) {
    return projects.filter((p) => p.key === filters.projectKey);
  }
  return projects;
}

export function computeDeliveryAnalysisSnapshot(input: {
  projects: MockProject[];
  filters: DeliveryAnalysisFilters;
  siteUrl: string;
  generatedAt: string;
  signals: JiraDeliverySignal[];
  gaps: JiraDeliveryGap[];
  trend: DeliveryAnalysisSnapshot["trend"];
  kpisDeltas?: Partial<DeliveryAnalysisKpis>;
}): DeliveryAnalysisSnapshot {
  const { projects, filters, siteUrl, generatedAt, signals, gaps, trend, kpisDeltas } = input;

  const openWork = projects.reduce((n, p) => n + p.openIssues, 0);
  const blocked = projects.reduce((n, p) => n + p.blockedCount, 0);
  const overdue = projects.reduce((n, p) => n + p.overdueCount, 0);
  const bugsOpen = projects.reduce((n, p) => n + p.bugsOpen, 0);
  const otherOpen = Math.max(0, openWork - blocked - overdue);

  const healthScore =
    projects.length > 0
      ? Math.round(projects.reduce((n, p) => n + p.healthScore, 0) / projects.length)
      : 0;

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
