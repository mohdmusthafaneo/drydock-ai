import type { Integration } from "@/generated/prisma/client";
import {
  isJiraOAuthConnected,
  parseJiraMeta,
  type JiraDeliverySnapshot,
} from "@/lib/jira-meta";
import {
  resolveReleaseScope,
  scopedMetricsFromSnapshot,
  scopeToJiraVersionMatch,
  type ReleaseScope,
} from "@/lib/release-scope";
import { sprintDaysOverdue } from "@/lib/jira-sprint-metrics";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";

export type JiraDeliverySignal = {
  id: string;
  category: "blockers" | "schedule" | "quality" | "sprint";
  label: string;
  value: string;
  severity: "info" | "warning" | "critical";
  jiraUrl?: string;
};

export type JiraDeliveryGap = {
  area: string;
  gap: string;
  priority: "low" | "medium" | "high";
};

export type JiraVersionMatch = {
  projectKey: string;
  projectName: string;
  versionId: string;
  versionName: string;
  matchedOn: "releaseName" | "version" | "combined" | "sprint" | "label";
};

export type JiraDeliveryHealth = {
  score: number;
  signals: JiraDeliverySignal[];
  gaps: JiraDeliveryGap[];
  matchedVersion?: JiraVersionMatch;
  releaseScope?: ReleaseScope;
  scopeLabel?: string;
  snapshotSyncedAt: string;
  scopedProject?: { key: string; name: string };
};

export type JiraAssessContext = {
  connected: boolean;
  synced: boolean;
  health: JiraDeliveryHealth | null;
};

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[\s._-]+/g, "");
}

function matchReleaseToSprint(
  releaseName: string,
  version: string | null | undefined,
  snapshot: JiraDeliverySnapshot,
  jiraSprintId?: number | null,
): JiraVersionMatch | undefined {
  if (jiraSprintId != null) {
    for (const project of snapshot.projects) {
      const sprint = project.activeSprint;
      if (sprint?.id === jiraSprintId) {
        return {
          projectKey: project.key,
          projectName: project.name,
          versionId: String(sprint.id),
          versionName: sprint.name,
          matchedOn: "sprint",
        };
      }
    }
  }

  const candidates = [releaseName.trim(), version?.trim()].filter(Boolean) as string[];

  for (const project of snapshot.projects) {
    const sprint = project.activeSprint;
    if (!sprint) continue;

    for (const candidate of candidates) {
      const sprintNorm = normalizeLabel(sprint.name);
      const candidateNorm = normalizeLabel(candidate);
      if (
        sprintNorm === candidateNorm ||
        sprintNorm.includes(candidateNorm) ||
        candidateNorm.includes(sprintNorm)
      ) {
        return {
          projectKey: project.key,
          projectName: project.name,
          versionId: String(sprint.id),
          versionName: sprint.name,
          matchedOn: "sprint",
        };
      }
    }
  }
  return undefined;
}

export function matchReleaseToFixVersion(
  releaseName: string,
  version: string | null | undefined,
  snapshot: JiraDeliverySnapshot,
  mapping?: ToolchainMapping["jira"],
  jiraFixVersionOverride?: string | null,
  jiraSprintId?: number | null,
): JiraVersionMatch | undefined {
  if (jiraFixVersionOverride?.trim()) {
    const target = jiraFixVersionOverride.trim();
    const targetNorm = normalizeLabel(target);

    for (const project of snapshot.projects) {
      for (const fixVersion of project.versions) {
        const versionNorm = normalizeLabel(fixVersion.name);
        if (versionNorm === targetNorm || fixVersion.name === target) {
          return {
            projectKey: project.key,
            projectName: project.name,
            versionId: fixVersion.id,
            versionName: fixVersion.name,
            matchedOn: "version",
          };
        }
      }
    }
    return undefined;
  }

  const tracking = mapping?.releaseTracking ?? "fixVersion";

  if (tracking === "sprint") {
    return matchReleaseToSprint(releaseName, version, snapshot, jiraSprintId);
  }

  if (tracking === "labels" || tracking === "none") {
    return undefined;
  }
  const candidates: Array<{ label: string; matchedOn: JiraVersionMatch["matchedOn"] }> = [];
  if (version?.trim()) {
    candidates.push({ label: version.trim(), matchedOn: "version" });
  }
  if (releaseName.trim()) {
    candidates.push({ label: releaseName.trim(), matchedOn: "releaseName" });
  }
  if (version?.trim() && releaseName.trim()) {
    const combined = `${releaseName.trim()} ${version.trim()}`;
    candidates.push({ label: combined, matchedOn: "combined" });
    candidates.push({
      label: `${releaseName.trim()}-${version.trim()}`,
      matchedOn: "combined",
    });
  }

  let best: { match: JiraVersionMatch; score: number } | undefined;

  for (const project of snapshot.projects) {
    for (const fixVersion of project.versions) {
      const versionNorm = normalizeLabel(fixVersion.name);
      if (!versionNorm) continue;

      for (const candidate of candidates) {
        const candidateNorm = normalizeLabel(candidate.label);
        if (!candidateNorm) continue;

        let score = 0;
        if (versionNorm === candidateNorm) {
          score = 100;
        } else if (versionNorm.includes(candidateNorm) || candidateNorm.includes(versionNorm)) {
          score = 70;
        } else {
          continue;
        }

        const match: JiraVersionMatch = {
          projectKey: project.key,
          projectName: project.name,
          versionId: fixVersion.id,
          versionName: fixVersion.name,
          matchedOn: candidate.matchedOn,
        };

        if (!best || score > best.score) {
          best = { match, score };
        }
      }
    }
  }

  return best?.match;
}

type ProjectScope = JiraDeliverySnapshot["projects"][number];

function pickProjectScope(
  snapshot: JiraDeliverySnapshot,
  match?: JiraVersionMatch,
): ProjectScope | undefined {
  if (match) {
    return snapshot.projects.find((p) => p.key === match.projectKey);
  }
  if (snapshot.projects.length === 1) {
    return snapshot.projects[0];
  }
  return undefined;
}

function aggregateMetrics(projects: ProjectScope[]) {
  return projects.reduce(
    (acc, p) => ({
      openIssues: acc.openIssues + p.openIssues,
      blockedCount: acc.blockedCount + p.blockedCount,
      overdueCount: acc.overdueCount + p.overdueCount,
      reopenedCount: acc.reopenedCount + (p.reopenedCount ?? 0),
      spilloverCount: acc.spilloverCount + (p.spilloverCount ?? 0),
      bugsOpen: acc.bugsOpen + p.bugsOpen,
      unassignedCount: acc.unassignedCount + p.unassignedCount,
    }),
    {
      openIssues: 0,
      blockedCount: 0,
      overdueCount: 0,
      reopenedCount: 0,
      spilloverCount: 0,
      bugsOpen: 0,
      unassignedCount: 0,
    },
  );
}

function computeHealthScore(
  signals: JiraDeliverySignal[],
  gaps: JiraDeliveryGap[],
): number {
  const penalty =
    gaps.filter((g) => g.priority === "high").length * 14 +
    gaps.filter((g) => g.priority === "medium").length * 7 +
    gaps.filter((g) => g.priority === "low").length * 3 +
    signals.filter((s) => s.severity === "critical").length * 10 +
    signals.filter((s) => s.severity === "warning").length * 4;

  return Math.max(0, Math.min(100, 92 - penalty));
}

function daysUntil(isoDate: string): number {
  const end = new Date(isoDate).getTime();
  return (end - Date.now()) / 86400000;
}

function daysOverdue(isoDate: string): number {
  return sprintDaysOverdue(isoDate);
}

function emitSprintSignals(
  projects: ProjectScope[],
  signals: JiraDeliverySignal[],
  gaps: JiraDeliveryGap[],
): void {
  for (const p of projects) {
    const sprint = p.activeSprint;
    if (!sprint || sprint.committed == null || sprint.committed <= 0) continue;

    const done = sprint.done ?? 0;
    const pct = Math.round((done / sprint.committed) * 100);
    let severity: JiraDeliverySignal["severity"] =
      pct < 40 ? "critical" : pct < 60 ? "warning" : "info";

    const overdueDays =
      sprint.daysOverdue ??
      (sprint.state === "active" && sprint.endDate
        ? daysOverdue(sprint.endDate)
        : 0);

    if (overdueDays > 0 && sprint.state === "active") {
      signals.push({
        id: `sprint-overdue-${p.key}`,
        category: "sprint",
        label: "Sprint overdue",
        value: `${sprint.name} overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`,
        severity: overdueDays >= 5 ? "critical" : "warning",
      });
      gaps.push({
        area: "Sprint",
        gap: `${p.key} sprint "${sprint.name}" is ${overdueDays} days past end date`,
        priority: overdueDays >= 5 ? "high" : "medium",
      });
      if (pct < 60) severity = "critical";
    }

    if (sprint.endDate && pct < 50 && daysUntil(sprint.endDate) < 3 && overdueDays === 0) {
      severity = "critical";
      gaps.push({
        area: "Sprint",
        gap: `${p.key} sprint "${sprint.name}" below 50% with under 3 days left`,
        priority: "high",
      });
    } else if (pct < 50) {
      gaps.push({
        area: "Sprint",
        gap: `${p.key} sprint "${sprint.name}" below 50% completion (${pct}%)`,
        priority: pct < 30 ? "high" : "medium",
      });
    }

    const qaCount = sprint.qaPipelineCount ?? p.qaPipelineCount ?? 0;
    if (qaCount > 0) {
      signals.push({
        id: `qa-pipeline-${p.key}`,
        category: "quality",
        label: "QA pipeline",
        value: `${qaCount} issue${qaCount === 1 ? "" : "s"} in testing / review`,
        severity:
          qaCount >= 10 ? "critical" : qaCount >= 5 ? "warning" : "info",
      });
      if (qaCount >= 5) {
        gaps.push({
          area: "Quality",
          gap: `${qaCount} sprint issue${qaCount === 1 ? "" : "s"} waiting in QA pipeline`,
          priority: qaCount >= 10 ? "high" : "medium",
        });
      }
    }

    const topAssignee = p.assigneeWorkload?.[0];
    if (topAssignee && topAssignee.openCount >= 3) {
      const pctLoad = Math.round(
        (topAssignee.openCount / Math.max(1, sprint.committed - done)) * 100,
      );
      signals.push({
        id: `assignee-load-${p.key}`,
        category: "sprint",
        label: "Assignee load",
        value: `${topAssignee.assignee} — ${topAssignee.openCount} open sprint issue${topAssignee.openCount === 1 ? "" : "s"}${pctLoad > 0 ? ` (${pctLoad}%)` : ""}`,
        severity:
          topAssignee.openCount >= 7
            ? "critical"
            : topAssignee.openCount >= 5
              ? "warning"
              : "info",
      });
    }

    const sp = sprint.storyPoints;
    const spLabel =
      sp && sp.committed > 0
        ? ` · ${sp.done}/${sp.committed} SP (${Math.round((sp.done / sp.committed) * 100)}%)`
        : "";

    signals.push({
      id: `sprint-${p.key}`,
      category: "sprint",
      label: "Active sprint",
      value: `${p.key} · ${sprint.name}: ${done}/${sprint.committed} done (${pct}%)${spLabel}`,
      severity,
    });
  }
}

function scopedProjects(
  snapshot: JiraDeliverySnapshot,
  projectKey?: string | null,
): ProjectScope[] {
  if (projectKey) {
    const match = snapshot.projects.find((p) => p.key === projectKey);
    return match ? [match] : [];
  }
  return snapshot.projects;
}

function mappingLabels(mapping?: ToolchainMapping["jira"]): LabelSet {
  return {
    blocked: mapping?.blockedStatusName ?? "Blocked",
    bug: mapping?.bugIssueType ?? "Bug",
  };
}
type LabelSet = {
  blocked: string;
  bug: string;
};
type ScopedMetrics = {
  openIssues: number;
  blockedCount: number;
  overdueCount: number;
  reopenedCount: number;
  spilloverCount: number;
  bugsOpen: number;
  unassignedCount: number;
};
type FixVersionSummary = {
  id: string;
  name: string;
  released: boolean;
  overdue?: boolean;
  releaseDate?: string | null;
  openIssuesInVersion?: number | null;
};

function buildBaseJiraSignals(
  metrics: ScopedMetrics,
  labels: LabelSet,
): JiraDeliverySignal[] {
  return [
    {
      id: "jira-blocked",
      category: "blockers",
      label: `${labels.blocked} issues`,
      value:
        metrics.blockedCount > 0
          ? `${metrics.blockedCount} in status ${labels.blocked}`
          : `No issues in status ${labels.blocked}`,
      severity:
        metrics.blockedCount >= 5
          ? "critical"
          : metrics.blockedCount > 0
            ? "warning"
            : "info",
    },
    {
      id: "jira-overdue",
      category: "schedule",
      label: "Overdue work",
      value:
        metrics.overdueCount > 0
          ? `${metrics.overdueCount} issue${metrics.overdueCount === 1 ? "" : "s"} past due date`
          : "No overdue issues in scope",
      severity:
        metrics.overdueCount >= 10
          ? "critical"
          : metrics.overdueCount > 0
            ? "warning"
            : "info",
    },
    {
      id: "jira-bugs",
      category: "quality",
      label: `Open ${labels.bug}s`,
      value: `${metrics.bugsOpen} open ${labels.bug}${metrics.bugsOpen === 1 ? "" : "s"} in scope`,
      severity:
        metrics.bugsOpen >= 15
          ? "critical"
          : metrics.bugsOpen >= 5
            ? "warning"
            : "info",
    },
    {
      id: "jira-reopened",
      category: "quality",
      label: "Reopened work",
      value:
        metrics.reopenedCount > 0
          ? `${metrics.reopenedCount} issue${metrics.reopenedCount === 1 ? "" : "s"} reopened from done`
          : "No reopened issues in scope",
      severity:
        metrics.reopenedCount >= 10
          ? "critical"
          : metrics.reopenedCount > 0
            ? "warning"
            : "info",
    },
    {
      id: "jira-spillover",
      category: "schedule",
      label: "Spillover work",
      value:
        metrics.spilloverCount > 0
          ? `${metrics.spilloverCount} issue${metrics.spilloverCount === 1 ? "" : "s"} carried from prior sprint${metrics.spilloverCount === 1 ? "" : "s"}`
          : "No sprint spillover in scope",
      severity:
        metrics.spilloverCount >= 10
          ? "critical"
          : metrics.spilloverCount > 0
            ? "warning"
            : "info",
    },
  ];
}

function appendFixVersionSignals(
  signals: JiraDeliverySignal[],
  matchedFixVersion: FixVersionSummary | undefined,
) {
  if (!matchedFixVersion) return;
  signals.push({
    id: "jira-fix-version",
    category: "schedule",
    label: "Fix version",
    value: matchedFixVersion.released
      ? `${matchedFixVersion.name} released`
      : matchedFixVersion.overdue
        ? `${matchedFixVersion.name} overdue (target ${matchedFixVersion.releaseDate ?? "unset"})`
        : `${matchedFixVersion.name} open${matchedFixVersion.releaseDate ? ` — target ${matchedFixVersion.releaseDate}` : ""}`,
    severity: matchedFixVersion.overdue
      ? "critical"
      : matchedFixVersion.released
        ? "info"
        : "warning",
  });

  if (matchedFixVersion.openIssuesInVersion != null) {
    signals.push({
      id: "jira-version-open",
      category: "schedule",
      label: "Open issues in version",
      value: `${matchedFixVersion.openIssuesInVersion} open issue${matchedFixVersion.openIssuesInVersion === 1 ? "" : "s"} in ${matchedFixVersion.name}`,
      severity:
        matchedFixVersion.openIssuesInVersion > 10
          ? "critical"
          : matchedFixVersion.openIssuesInVersion > 0
            ? "warning"
            : "info",
    });
  }
}
export function analyzePortfolioDeliveryHealth(input: {
  snapshot: JiraDeliverySnapshot;
  projectKey?: string | null;
  mapping?: ToolchainMapping["jira"];
}): JiraDeliveryHealth {
  const labels = mappingLabels(input.mapping);
  const projects = scopedProjects(input.snapshot, input.projectKey);
  if (projects.length === 0) {
    return {
      score: 0,
      signals: [],
      gaps: [],
      snapshotSyncedAt: input.snapshot.syncedAt,
    };
  }

  const metrics = aggregateMetrics(projects);
  const isOrgScope = !input.projectKey;
  const signals: JiraDeliverySignal[] = [];
  const gaps: JiraDeliveryGap[] = [];

  const blockedThreshold = isOrgScope ? 5 : 3;
  const blockedSeverity =
    metrics.blockedCount >= blockedThreshold
      ? "critical"
      : metrics.blockedCount > 0
        ? "warning"
        : "info";

  signals.push({
    id: "portfolio-blocked",
    category: "blockers",
    label: isOrgScope ? "Portfolio blocked work" : `${labels.blocked} issues`,
    value:
      metrics.blockedCount > 0
        ? `${metrics.blockedCount} in status ${labels.blocked}`
        : `No issues in status ${labels.blocked}`,
    severity: blockedSeverity,
  });

  if (isOrgScope) {
    for (const p of projects) {
      if (p.blockedCount >= 3) {
        gaps.push({
          area: "Delivery",
          gap: `${p.key}: ${p.blockedCount} blocked issue${p.blockedCount === 1 ? "" : "s"}`,
          priority: p.blockedCount >= 5 ? "high" : "medium",
        });
      }
    }
  }

  signals.push({
    id: "overdue-cluster",
    category: "schedule",
    label: isOrgScope ? "Overdue cluster" : "Overdue work",
    value:
      metrics.overdueCount > 0
        ? `${metrics.overdueCount} overdue issue${metrics.overdueCount === 1 ? "" : "s"} in scope`
        : "No overdue issues in scope",
    severity:
      metrics.overdueCount >= 10
        ? "critical"
        : metrics.overdueCount > 0
          ? "warning"
          : "info",
  });

  signals.push({
    id: "bug-backlog",
    category: "quality",
    label: isOrgScope ? `${labels.bug} backlog` : `Open ${labels.bug}s`,
    value: `${metrics.bugsOpen} open ${labels.bug}${metrics.bugsOpen === 1 ? "" : "s"} in scope`,
    severity:
      metrics.bugsOpen >= 15
        ? "critical"
        : metrics.bugsOpen >= 5
          ? "warning"
          : "info",
  });

  signals.push({
    id: "reopened-cluster",
    category: "quality",
    label: isOrgScope ? "Reopened issues" : "Reopened work",
    value:
      metrics.reopenedCount > 0
        ? `${metrics.reopenedCount} issue${metrics.reopenedCount === 1 ? "" : "s"} reopened from done`
        : "No reopened issues in scope",
    severity:
      metrics.reopenedCount >= 10
        ? "critical"
        : metrics.reopenedCount > 0
          ? "warning"
          : "info",
  });

  signals.push({
    id: "spillover",
    category: "schedule",
    label: isOrgScope ? "Sprint spillover" : "Spillover work",
    value:
      metrics.spilloverCount > 0
        ? `${metrics.spilloverCount} issue${metrics.spilloverCount === 1 ? "" : "s"} carried from prior sprint${metrics.spilloverCount === 1 ? "" : "s"}`
        : "No sprint spillover in scope",
    severity:
      metrics.spilloverCount >= 10
        ? "critical"
        : metrics.spilloverCount > 0
          ? "warning"
          : "info",
  });

  const slippedVersions: Array<{ projectKey: string; name: string }> = [];
  for (const p of projects) {
    for (const v of p.versions) {
      if (v.overdue && !v.released) {
        slippedVersions.push({ projectKey: p.key, name: v.name });
      }
    }
  }

  if (slippedVersions.length > 0) {
    const preview = slippedVersions
      .slice(0, 3)
      .map((v) => `${v.projectKey} · ${v.name}`)
      .join("; ");
    signals.push({
      id: "version-slip",
      category: "schedule",
      label: "Version slip",
      value:
        slippedVersions.length === 1
          ? preview
          : `${slippedVersions.length} overdue fix versions — ${preview}`,
      severity: "critical",
    });
    for (const v of slippedVersions) {
      gaps.push({
        area: "Release",
        gap: `Fix version "${v.name}" (${v.projectKey}) is past target and not released`,
        priority: "high",
      });
    }
  }

  emitSprintSignals(projects, signals, gaps);

  const syncAgeHours =
    (Date.now() - new Date(input.snapshot.syncedAt).getTime()) / 3600000;
  if (syncAgeHours > 48) {
    signals.push({
      id: "stale-sync",
      category: "schedule",
      label: "Stale sync",
      value: `Last synced ${Math.floor(syncAgeHours)}h ago — refresh for current counts`,
      severity: syncAgeHours > 96 ? "critical" : "warning",
    });
    gaps.push({
      area: "Data freshness",
      gap: "Jira delivery snapshot is older than 48 hours",
      priority: syncAgeHours > 96 ? "high" : "medium",
    });
  }

  if (metrics.blockedCount > 0 && !isOrgScope) {
    gaps.push({
      area: "Delivery",
      gap: `${metrics.blockedCount} blocked issue${metrics.blockedCount === 1 ? "" : "s"} in Jira`,
      priority: metrics.blockedCount >= 3 ? "high" : "medium",
    });
  }

  if (metrics.overdueCount > 0) {
    gaps.push({
      area: "Schedule",
      gap: `${metrics.overdueCount} overdue issue${metrics.overdueCount === 1 ? "" : "s"} in Jira`,
      priority: metrics.overdueCount >= 5 ? "high" : "medium",
    });
  }

  if (metrics.bugsOpen >= 5) {
    gaps.push({
      area: "Quality",
      gap: `${metrics.bugsOpen} open ${labels.bug}s in Jira scope`,
      priority: metrics.bugsOpen >= 10 ? "high" : "medium",
    });
  }

  if (metrics.reopenedCount > 0) {
    gaps.push({
      area: "Quality",
      gap: `${metrics.reopenedCount} issue${metrics.reopenedCount === 1 ? "" : "s"} reopened from done status`,
      priority: metrics.reopenedCount >= 5 ? "high" : "medium",
    });
  }

  if (metrics.spilloverCount > 0) {
    gaps.push({
      area: "Sprint",
      gap: `${metrics.spilloverCount} issue${metrics.spilloverCount === 1 ? "" : "s"} spilled over from prior sprint${metrics.spilloverCount === 1 ? "" : "s"}`,
      priority: metrics.spilloverCount >= 5 ? "high" : "medium",
    });
  }

  const score = computeHealthScore(signals, gaps);
  const scoped = projects.length === 1 ? projects[0] : undefined;

  return {
    score,
    signals,
    gaps,
    snapshotSyncedAt: input.snapshot.syncedAt,
    scopedProject: scoped ? { key: scoped.key, name: scoped.name } : undefined,
  };
}

export function analyzeJiraDeliveryHealth(input: {
  snapshot: JiraDeliverySnapshot;
  releaseName: string;
  version?: string | null;
  jiraFixVersion?: string | null;
  jiraSprintId?: number | null;
  mapping?: ToolchainMapping["jira"];
}): JiraDeliveryHealth {
  const labels = mappingLabels(input.mapping);
  const releaseScope = resolveReleaseScope({
    snapshot: input.snapshot,
    releaseTracking: input.mapping?.releaseTracking,
    jiraSprintId: input.jiraSprintId,
    jiraFixVersion: input.jiraFixVersion,
    releaseName: input.releaseName,
    version: input.version,
    projectKey: input.jiraSprintId != null
      ? input.snapshot.projects.find((p) => p.activeSprint?.id === input.jiraSprintId)?.key
      : undefined,
  });

  const matchedVersion = releaseScope
    ? {
        ...scopeToJiraVersionMatch(releaseScope),
        projectName:
          input.snapshot.projects.find((p) => p.key === releaseScope.projectKey)?.name ??
          releaseScope.projectKey,
        matchedOn: releaseScope.mode === "sprint" ? ("sprint" as const) : ("version" as const),
      }
    : matchReleaseToFixVersion(
        input.releaseName,
        input.version,
        input.snapshot,
        input.mapping,
        input.jiraFixVersion,
        input.jiraSprintId,
      );

  const scopedProject = pickProjectScope(input.snapshot, matchedVersion);
  const scopeLabel = releaseScope?.mode === "sprint"
    ? `sprint ${releaseScope.sprintName}`
    : releaseScope?.mode === "fixVersion"
      ? `fix version ${releaseScope.versionName}`
      : undefined;

  const metrics = releaseScope
    ? scopedMetricsFromSnapshot(releaseScope, input.snapshot)
    : scopedProject
      ? {
          openIssues: scopedProject.openIssues,
          blockedCount: scopedProject.blockedCount,
          overdueCount: scopedProject.overdueCount,
          reopenedCount: scopedProject.reopenedCount ?? 0,
          spilloverCount: scopedProject.spilloverCount ?? 0,
          bugsOpen: scopedProject.bugsOpen,
          unassignedCount: scopedProject.unassignedCount,
        }
      : aggregateMetrics(input.snapshot.projects);

  const matchedFixVersion =
    matchedVersion && scopedProject
      ? scopedProject.versions.find((v) => v.id === matchedVersion.versionId)
      : undefined;

  const signals: JiraDeliverySignal[] = buildBaseJiraSignals(metrics, labels);
  appendFixVersionSignals(signals, matchedFixVersion);
  const gaps: JiraDeliveryGap[] = [];

  if (scopedProject?.activeSprint) {
    emitSprintSignals([scopedProject], signals, gaps);
  }

  const tracking = input.mapping?.releaseTracking ?? "fixVersion";
  if (!matchedVersion && input.snapshot.projects.length > 0 && tracking !== "none") {
    const target =
      tracking === "sprint"
        ? "sprint"
        : tracking === "labels"
          ? "release label"
          : "fix version";
    gaps.push({
      area: "Traceability",
      gap: `Release "${input.releaseName}"${input.version ? ` (${input.version})` : ""} not matched to a Jira ${target}`,
      priority: "medium",
    });
  }

  if (metrics.blockedCount > 0) {
    gaps.push({
      area: "Delivery",
      gap: scopeLabel
        ? `${metrics.blockedCount} blocked issue${metrics.blockedCount === 1 ? "" : "s"} in ${scopeLabel}`
        : `${metrics.blockedCount} issue${metrics.blockedCount === 1 ? "" : "s"} in status ${labels.blocked}`,
      priority: metrics.blockedCount >= 3 ? "high" : "medium",
    });
  }

  if (metrics.overdueCount > 0) {
    gaps.push({
      area: "Schedule",
      gap: scopeLabel
        ? `${metrics.overdueCount} overdue issue${metrics.overdueCount === 1 ? "" : "s"} in ${scopeLabel}`
        : `${metrics.overdueCount} overdue issue${metrics.overdueCount === 1 ? "" : "s"} in Jira`,
      priority: metrics.overdueCount >= 5 ? "high" : "medium",
    });
  }

  if (metrics.bugsOpen >= 5) {
    gaps.push({
      area: "Quality",
      gap: scopeLabel
        ? `${metrics.bugsOpen} open ${labels.bug}s in ${scopeLabel}`
        : `${metrics.bugsOpen} open ${labels.bug}s in Jira scope`,
      priority: metrics.bugsOpen >= 10 ? "high" : "medium",
    });
  }

  if (metrics.reopenedCount > 0) {
    gaps.push({
      area: "Quality",
      gap: `${metrics.reopenedCount} issue${metrics.reopenedCount === 1 ? "" : "s"} reopened from done status`,
      priority: metrics.reopenedCount >= 5 ? "high" : "medium",
    });
  }

  if (metrics.spilloverCount > 0) {
    gaps.push({
      area: "Sprint",
      gap: `${metrics.spilloverCount} issue${metrics.spilloverCount === 1 ? "" : "s"} spilled over from prior sprint${metrics.spilloverCount === 1 ? "" : "s"}`,
      priority: metrics.spilloverCount >= 5 ? "high" : "medium",
    });
  }

  if (matchedFixVersion?.overdue && !matchedFixVersion.released) {
    gaps.push({
      area: "Release",
      gap: `Fix version "${matchedFixVersion.name}" is past target date and not released`,
      priority: "high",
    });
  }

  if (
    matchedFixVersion?.openIssuesInVersion != null &&
    matchedFixVersion.openIssuesInVersion > 0
  ) {
    gaps.push({
      area: "Release",
      gap: `${matchedFixVersion.openIssuesInVersion} open issue${matchedFixVersion.openIssuesInVersion === 1 ? "" : "s"} still tagged to fix version "${matchedFixVersion.name}"`,
      priority: matchedFixVersion.openIssuesInVersion >= 5 ? "high" : "medium",
    });
  }

  const score = computeHealthScore(signals, gaps);

  return {
    score,
    signals,
    gaps,
    matchedVersion,
    releaseScope: releaseScope ?? undefined,
    scopeLabel: releaseScope
      ? releaseScope.mode === "sprint"
        ? releaseScope.sprintName
        : releaseScope.versionName
      : undefined,
    snapshotSyncedAt: input.snapshot.syncedAt,
    scopedProject: scopedProject
      ? { key: scopedProject.key, name: scopedProject.name }
      : undefined,
  };
}

export function resolveJiraAssessContext(input: {
  integrations: Integration[];
  releaseName: string;
  version?: string | null;
  jiraFixVersion?: string | null;
  jiraSprintId?: number | null;
  mapping?: ToolchainMapping["jira"];
}): JiraAssessContext {
  const jira = input.integrations.find(
    (i) => i.provider === "JIRA" && isJiraOAuthConnected(i),
  );
  if (!jira) {
    return { connected: false, synced: false, health: null };
  }

  const meta = parseJiraMeta(jira.metadataJson);
  const snapshot = meta.deliverySnapshot;
  if (!snapshot?.projects?.length) {
    return { connected: true, synced: false, health: null };
  }

  return {
    connected: true,
    synced: true,
    health: analyzeJiraDeliveryHealth({
      snapshot,
      releaseName: input.releaseName,
      version: input.version,
      jiraFixVersion: input.jiraFixVersion,
      jiraSprintId: input.jiraSprintId,
      mapping: input.mapping,
    }),
  };
}
