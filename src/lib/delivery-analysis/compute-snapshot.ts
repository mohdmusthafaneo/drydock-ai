import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisKpis,
  DeliveryAnalysisProjectRow,
  DeliveryAnalysisSnapshot,
  DeliveryAnalysisSprintRow,
  DeliveryAnalysisVersionRow,
} from "@/lib/delivery-analysis/types";
import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import { sprintDaysOverdue } from "@/lib/jira-sprint-metrics";
import {
  analyzePortfolioDeliveryHealth,
  type JiraDeliveryGap,
  type JiraDeliverySignal,
} from "@/lib/jira-delivery-health";
import {
  assessJiraHygiene,
  assessPortfolioJiraHygiene,
  applyHygieneScoreDiscount,
  summarizePortfolioHygiene,
  type PortfolioJiraHygiene,
} from "@/lib/jira-hygiene";
import {
  buildJiraIssuesSearchUrl,
  buildSprintJql,
  jiraUrlForFixVersion,
  jiraUrlForHygieneFinding,
  jiraUrlForKpi,
  jiraUrlForSignal,
  type JiraLinkContext,
} from "@/lib/jira-issue-links";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";
import { resolveJiraMappingForProject } from "@/lib/toolchain-mapping";
import { aggregateOrgScopedMetrics } from "@/lib/release-scope";

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
  mapping?: ToolchainMapping,
  hygieneBlock?: PortfolioJiraHygiene,
): SnapshotProject[] {
  const projects = projectKey
    ? jiraSnapshot.projects.filter((p) => p.key === projectKey)
    : jiraSnapshot.projects;

  return projects.map((p) => {
    const projectMapping = resolveJiraMappingForProject(mapping, p.key) ?? mapping?.jira;
    const health = analyzePortfolioDeliveryHealth({
      snapshot: jiraSnapshot,
      projectKey: p.key,
      mapping: projectMapping,
    });

    const hygiene =
      hygieneBlock?.byProject[p.key] ??
      (mapping
        ? assessJiraHygiene({
            project: p,
            mapping: projectMapping,
            snapshotSyncedAt: jiraSnapshot.syncedAt,
            dataQualityFlags: jiraSnapshot.dataQualityFlags,
          })
        : undefined);

    const sprint = p.activeSprint;
    let sprintRow: SnapshotProject["sprint"];
    let activeSprint: DeliveryAnalysisProjectRow["activeSprint"];

    if (sprint && sprint.committed != null && sprint.committed > 0) {
      const done = sprint.done ?? 0;
      const pct = Math.round((done / sprint.committed) * 100);
      const daysOverdue =
        sprint.daysOverdue ??
        (sprint.state === "active" ? sprintDaysOverdue(sprint.endDate) : 0);
      activeSprint = {
        name: sprint.name,
        done,
        committed: sprint.committed,
        pct,
        storyPoints: sprint.storyPoints,
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
        sprintId: sprint.id,
        storyPoints: sprint.storyPoints,
        daysOverdue: daysOverdue > 0 ? daysOverdue : undefined,
        statusByName: sprint.statusByName,
        qaPipelineCount: sprint.qaPipelineCount ?? p.qaPipelineCount,
      };
    }

    return {
      key: p.key,
      name: p.name,
      healthScore: applyHygieneScoreDiscount(health.score, hygiene),
      openIssues: p.openIssues,
      blockedCount: p.blockedCount,
      overdueCount: p.overdueCount,
      reopenedCount: p.reopenedCount,
      spilloverCount: p.spilloverCount,
      bugsOpen: p.bugsOpen,
      resolvedLast7d: p.resolvedLast7d,
      statusBreakdown: p.statusBreakdown,
      qaPipelineCount: p.qaPipelineCount ?? sprint?.qaPipelineCount,
      assigneeWorkload: p.assigneeWorkload,
      activeSprint,
      hygiene,
      versions: p.versions.map((v) => ({
        id: v.id,
        name: v.name,
        released: v.released,
        releaseDate: v.releaseDate,
        overdue: v.overdue,
        openIssuesInVersion: v.openIssuesInVersion,
      })),
      sprint: sprintRow,
    };
  });
}

export function computeDeliveryAnalysisFromJira(input: {
  jiraSnapshot: JiraDeliverySnapshot;
  siteUrl?: string;
  filters: DeliveryAnalysisFilters;
  mapping?: ToolchainMapping;
  releaseTracking?: NonNullable<ToolchainMapping["jira"]>["releaseTracking"];
  jiraHygiene?: PortfolioJiraHygiene;
  calibrationPending?: boolean;
  calibrationMessage?: string;
}): DeliveryAnalysisSnapshot {
  const hygieneBlock =
    input.jiraHygiene ??
    (input.mapping
      ? assessPortfolioJiraHygiene(input.jiraSnapshot, input.mapping)
      : undefined);

  const allRows = jiraProjectsToSnapshotRows(
    input.jiraSnapshot,
    null,
    input.mapping,
    hygieneBlock,
  );
  const health = analyzePortfolioDeliveryHealth({
    snapshot: input.jiraSnapshot,
    projectKey: input.filters.projectKey,
    mapping: input.filters.projectKey
      ? resolveJiraMappingForProject(input.mapping, input.filters.projectKey) ?? input.mapping?.jira
      : input.mapping?.jira,
  });

  const hygieneSummary = summarizePortfolioHygiene(hygieneBlock);
  let portfolioHealth = health.score;
  if (hygieneSummary?.degradesTrust) {
    portfolioHealth = applyHygieneScoreDiscount(portfolioHealth, {
      degradesTrust: true,
      portfolioScore: hygieneSummary.portfolioScore,
    });
  }

  return computeDeliveryAnalysisSnapshot({
    projects: filterSnapshotProjects(allRows, input.filters),
    filters: input.filters,
    siteUrl: input.siteUrl ?? "",
    generatedAt: input.jiraSnapshot.syncedAt,
    signals: health.signals,
    gaps: health.gaps,
    trend: [],
    portfolioHealthScore: portfolioHealth,
    jiraHygiene: hygieneSummary
      ? {
          score: hygieneSummary.portfolioScore,
          degradesTrust: hygieneSummary.degradesTrust,
          worstProject: hygieneSummary.worstProject,
          findings: hygieneSummary.topFindings,
        }
      : undefined,
    mapping: input.mapping,
    jiraSnapshot: input.jiraSnapshot,
    releaseTracking: input.releaseTracking ?? input.mapping?.jira?.releaseTracking,
    calibrationPending: input.calibrationPending,
    calibrationMessage: input.calibrationMessage,
  });
}

export function snapshotForFilters(
  jiraSnapshot: JiraDeliverySnapshot,
  siteUrl: string | undefined,
  filters: DeliveryAnalysisFilters,
  mapping?: ToolchainMapping,
  jiraHygiene?: PortfolioJiraHygiene,
  calibration?: { pending: boolean; message?: string },
): DeliveryAnalysisSnapshot {
  return computeDeliveryAnalysisFromJira({
    jiraSnapshot,
    siteUrl,
    filters,
    mapping,
    releaseTracking: mapping?.jira?.releaseTracking,
    jiraHygiene,
    calibrationPending: calibration?.pending,
    calibrationMessage: calibration?.message,
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
  jiraHygiene?: DeliveryAnalysisSnapshot["jiraHygiene"];
  mapping?: ToolchainMapping;
  jiraSnapshot?: JiraDeliverySnapshot;
  releaseTracking?: NonNullable<ToolchainMapping["jira"]>["releaseTracking"];
  calibrationPending?: boolean;
  calibrationMessage?: string;
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
    jiraHygiene,
    mapping,
    jiraSnapshot,
    releaseTracking,
    calibrationPending,
    calibrationMessage,
  } = input;

  const tracking = releaseTracking ?? mapping?.jira?.releaseTracking;
  const useReleaseScope =
    jiraSnapshot &&
    (tracking === "sprint" || tracking === "fixVersion");

  const scopedMetrics = useReleaseScope
    ? aggregateOrgScopedMetrics(
        jiraSnapshot!,
        tracking,
        filters.projectKey,
      )
    : null;

  const openWork = scopedMetrics?.openIssues ?? projects.reduce((n, p) => n + p.openIssues, 0);
  const blocked = scopedMetrics?.blockedCount ?? projects.reduce((n, p) => n + p.blockedCount, 0);
  const overdue = scopedMetrics?.overdueCount ?? projects.reduce((n, p) => n + p.overdueCount, 0);
  const reopened =
    scopedMetrics?.reopenedCount ??
    projects.reduce((n, p) => n + (p.reopenedCount ?? 0), 0);
  const spillover =
    scopedMetrics?.spilloverCount ??
    projects.reduce((n, p) => n + (p.spilloverCount ?? 0), 0);
  const bugsOpen = scopedMetrics?.bugsOpen ?? projects.reduce((n, p) => n + p.bugsOpen, 0);
  const resolvedLast7d = projects.reduce((n, p) => n + (p.resolvedLast7d ?? 0), 0);
  const qaPipeline =
    scopedMetrics?.qaPipelineCount ??
    projects.reduce((n, p) => n + (p.qaPipelineCount ?? 0), 0);
  const hasThroughput = projects.some((p) => p.resolvedLast7d != null);
  const otherOpen = Math.max(0, openWork - blocked - overdue);

  const healthScoreRaw =
    portfolioHealthScore ??
    (projects.length > 0
      ? Math.round(projects.reduce((n, p) => n + p.healthScore, 0) / projects.length)
      : 0);
  let healthScore = calibrationPending ? Math.min(healthScoreRaw, 69) : healthScoreRaw;
  if (jiraHygiene?.degradesTrust) {
    healthScore = applyHygieneScoreDiscount(healthScore, {
      degradesTrust: true,
      portfolioScore: jiraHygiene.score,
    });
  }

  const sprintRows: DeliveryAnalysisSprintRow[] = projects
    .filter((p) => p.sprint)
    .map((p) => ({
      projectKey: p.key,
      projectName: p.name,
      ...p.sprint!,
    }));

  const sprintCompletionPct =
    scopedMetrics?.sprintCompletionPct ??
    (sprintRows.length > 0
      ? Math.round(sprintRows.reduce((n, s) => n + s.pct, 0) / sprintRows.length)
      : null);

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

  const snapshot: DeliveryAnalysisSnapshot = {
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
      reopened,
      reopenedDelta: kpisDeltas?.reopenedDelta,
      spillover,
      spilloverDelta: kpisDeltas?.spilloverDelta,
      bugsOpen,
      qaPipeline: qaPipeline > 0 ? qaPipeline : undefined,
      sprintCompletionPct,
      resolvedLast7d: hasThroughput ? resolvedLast7d : undefined,
      calibrationPending,
      calibrationMessage,
      scopeLabel: scopedMetrics?.scopeLabel,
      scopeMode: scopedMetrics?.mode,
    },
    riskMix: { blocked, overdue, bugs: bugsOpen, otherOpen },
    trend,
    byProject: projects.map(({ versions: _v, sprint: _s, ...row }) => row),
    versions,
    sprints: sprintRows,
    signals: filteredSignals,
    gaps,
    jiraHygiene,
    scopeLabel: scopedMetrics?.scopeLabel,
    scopeMode: scopedMetrics?.mode,
  };

  if (siteUrl && mapping?.jira) {
    return attachJiraLinksToSnapshot(snapshot, {
      siteUrl,
      mapping,
      projectKeys: snapshot.projectKeys,
      projects,
      jiraSnapshot,
      releaseTracking: tracking,
    });
  }

  return snapshot;
}

function firstSlippedVersion(projects: SnapshotProject[]): {
  projectKey: string;
  versionName: string;
} | null {
  for (const p of projects) {
    for (const v of p.versions) {
      if (v.overdue && !v.released) {
        return { projectKey: p.key, versionName: v.name };
      }
    }
  }
  return null;
}

function signalLinkExtras(
  signal: JiraDeliverySignal,
  projects: SnapshotProject[],
  jiraSnapshot?: JiraDeliverySnapshot,
): Parameters<typeof jiraUrlForSignal>[2] {
  if (signal.id.startsWith("sprint-")) {
    const projectKey = signal.id.slice(7);
    const sprintId =
      projects.find((p) => p.key === projectKey)?.sprint?.sprintId ??
      jiraSnapshot?.projects.find((p) => p.key === projectKey)?.activeSprint?.id;
    return { projectKey, sprintId };
  }

  if (signal.id === "version-slip") {
    const slipped = firstSlippedVersion(projects);
    if (slipped) {
      return { projectKey: slipped.projectKey, versionName: slipped.versionName };
    }
  }

  if (signal.id === "jira-sprint" && projects.length === 1) {
    const project = projects[0];
    const sprintId =
      project.sprint?.sprintId ??
      jiraSnapshot?.projects.find((p) => p.key === project.key)?.activeSprint?.id;
    return { projectKey: project.key, sprintId };
  }

  if (signal.id === "spillover") {
    if (projects.length === 1) {
      const project = projects[0];
      const sprintId =
        project.sprint?.sprintId ??
        jiraSnapshot?.projects.find((p) => p.key === project.key)?.activeSprint?.id;
      return { projectKey: project.key, sprintId };
    }
  }

  return undefined;
}

function resolveLinkReleaseScope(
  snapshot: DeliveryAnalysisSnapshot,
  projects: SnapshotProject[],
  jiraSnapshot?: JiraDeliverySnapshot,
): JiraLinkContext["releaseScope"] {
  if (!snapshot.scopeMode || projects.length === 0) return undefined;
  const project = projects[0]!;
  if (snapshot.scopeMode === "sprint") {
    const sprintId =
      project.sprint?.sprintId ??
      jiraSnapshot?.projects.find((p) => p.key === project.key)?.activeSprint?.id;
    return {
      mode: "sprint",
      scopeLabel: snapshot.scopeLabel,
      projectKey: project.key,
      sprintId,
    };
  }
  const versionName =
    project.versions.find((v) => !v.released)?.name ?? snapshot.scopeLabel;
  return {
    mode: "fixVersion",
    scopeLabel: snapshot.scopeLabel,
    projectKey: project.key,
    versionName,
  };
}

function attachJiraLinksToSnapshot(
  snapshot: DeliveryAnalysisSnapshot,
  input: {
    siteUrl: string;
    mapping: ToolchainMapping;
    projectKeys: string[];
    projects: SnapshotProject[];
    jiraSnapshot?: JiraDeliverySnapshot;
    releaseTracking?: NonNullable<ToolchainMapping["jira"]>["releaseTracking"];
  },
): DeliveryAnalysisSnapshot {
  const linkCtx: JiraLinkContext = {
    siteUrl: input.siteUrl,
    mapping: input.mapping,
    projectKeys: input.projectKeys,
    releaseScope: resolveLinkReleaseScope(snapshot, input.projects, input.jiraSnapshot),
  };

  snapshot.kpis.jiraLinks = {
    openWork: jiraUrlForKpi("openWork", linkCtx),
    blocked: jiraUrlForKpi("blocked", linkCtx),
    overdue: jiraUrlForKpi("overdue", linkCtx),
  };

  snapshot.signals = snapshot.signals.map((signal) => ({
    ...signal,
    jiraUrl: jiraUrlForSignal(
      signal.id,
      linkCtx,
      signalLinkExtras(signal, input.projects, input.jiraSnapshot),
    ),
  }));

  snapshot.sprints = snapshot.sprints.map((sprint) => {
    if (sprint.sprintId != null) {
      return {
        ...sprint,
        jiraUrl: buildJiraIssuesSearchUrl(input.siteUrl, buildSprintJql(sprint.sprintId)),
      };
    }
    return sprint;
  });

  snapshot.versions = snapshot.versions.map((version) => {
    if (version.openIssuesInVersion != null && version.openIssuesInVersion > 0) {
      return {
        ...version,
        jiraUrl: jiraUrlForFixVersion(version.projectKey, version.name, linkCtx),
      };
    }
    return version;
  });

  if (snapshot.jiraHygiene) {
    snapshot.jiraHygiene = {
      ...snapshot.jiraHygiene,
      findings: snapshot.jiraHygiene.findings.map((finding) => ({
        ...finding,
        jiraUrl: finding.projectKey
          ? jiraUrlForHygieneFinding(finding.id, finding.projectKey, linkCtx)
          : undefined,
      })),
    };
  }

  snapshot.byProject = snapshot.byProject.map((row) => {
    if (!row.hygiene) return row;
    return {
      ...row,
      hygiene: {
        ...row.hygiene,
        findings: row.hygiene.findings.map((finding) => ({
          ...finding,
          projectKey: row.key,
          jiraUrl: jiraUrlForHygieneFinding(finding.id, row.key, linkCtx),
        })),
      },
    };
  });

  return snapshot;
}

/** @deprecated Use filterSnapshotProjects */
export const filterMockProjects = filterSnapshotProjects;
