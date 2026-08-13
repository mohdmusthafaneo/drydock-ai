import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import type { ReleaseScope, ScopedMetrics } from "@/lib/release-scope_match";
import { scopedMetricsFromSnapshot, snapshotProjects } from "@/lib/release-scope_metrics";

/** Org-level active release scope when methodology is sprint or fixVersion. */
export function resolveOrgReleaseScope(input: {
  snapshot: JiraDeliverySnapshot;
  releaseTracking: "sprint" | "fixVersion";
  projectKey?: string | null;
}): ReleaseScope | null {
  const projects = input.projectKey
    ? snapshotProjects(input.snapshot, input.projectKey)
    : input.snapshot.projects;

  if (input.releaseTracking === "sprint") {
    const withSprint = projects.filter((p) => p.activeSprint);
    if (withSprint.length === 0) return null;
    const sprint = withSprint[0].activeSprint!;
    return {
      mode: "sprint",
      projectKey: withSprint[0].key,
      sprintId: sprint.id,
      sprintName: sprint.name,
    };
  }

  for (const project of projects) {
    const openVersion = project.versions.find((v) => !v.released);
    if (openVersion) {
      return {
        mode: "fixVersion",
        projectKey: project.key,
        versionId: openVersion.id,
        versionName: openVersion.name,
      };
    }
  }
  return null;
}

/** Sum scoped metrics across all projects' active release scopes (portfolio view). */
export function aggregateOrgScopedMetrics(
  snapshot: JiraDeliverySnapshot,
  releaseTracking: "sprint" | "fixVersion",
  projectKey?: string | null,
): ScopedMetrics & { scopeLabel: string; mode: ReleaseScope["mode"] } {
  const projects = projectKey
    ? snapshot.projects.filter((p) => p.key === projectKey)
    : snapshot.projects;

  const scopes: ReleaseScope[] = [];
  for (const project of projects) {
    if (releaseTracking === "sprint" && project.activeSprint) {
      scopes.push({
        mode: "sprint",
        projectKey: project.key,
        sprintId: project.activeSprint.id,
        sprintName: project.activeSprint.name,
      });
    } else if (releaseTracking === "fixVersion") {
      const openVersion = project.versions.find((v) => !v.released);
      if (openVersion) {
        scopes.push({
          mode: "fixVersion",
          projectKey: project.key,
          versionId: openVersion.id,
          versionName: openVersion.name,
        });
      }
    }
  }

  if (scopes.length === 0) {
    return {
      openIssues: 0,
      blockedCount: 0,
      overdueCount: 0,
      reopenedCount: 0,
      spilloverCount: 0,
      bugsOpen: 0,
      unassignedCount: 0,
      sprintCompletionPct: null,
      scopeLabel: releaseTracking === "sprint" ? "Active sprint" : "Open fix version",
      mode: releaseTracking,
    };
  }

  const metricsList = scopes.map((s) => scopedMetricsFromSnapshot(s, snapshot));
  const sprintPcts = metricsList
    .map((m) => m.sprintCompletionPct)
    .filter((p): p is number => p != null);

  const scopeLabels = scopes.map((s) =>
    s.mode === "sprint" ? s.sprintName : s.versionName,
  );

  return {
    openIssues: metricsList.reduce((n, m) => n + m.openIssues, 0),
    blockedCount: metricsList.reduce((n, m) => n + m.blockedCount, 0),
    overdueCount: metricsList.reduce((n, m) => n + m.overdueCount, 0),
    reopenedCount: metricsList.reduce((n, m) => n + m.reopenedCount, 0),
    spilloverCount: metricsList.reduce((n, m) => n + m.spilloverCount, 0),
    bugsOpen: metricsList.reduce((n, m) => n + m.bugsOpen, 0),
    unassignedCount: metricsList.reduce((n, m) => n + m.unassignedCount, 0),
    qaPipelineCount: metricsList.reduce((n, m) => n + (m.qaPipelineCount ?? 0), 0),
    sprintCompletionPct:
      sprintPcts.length > 0
        ? Math.round(sprintPcts.reduce((n, p) => n + p, 0) / sprintPcts.length)
        : null,
    scopeLabel: scopeLabels.length === 1 ? scopeLabels[0]! : scopeLabels.join(", "),
    mode: scopes[0]!.mode,
  };
}

export function scopeToJiraVersionMatch(scope: ReleaseScope): {
  projectKey: string;
  versionId: string;
  versionName: string;
  matchedOn: "sprint" | "version";
} {
  if (scope.mode === "sprint") {
    return {
      projectKey: scope.projectKey,
      versionId: String(scope.sprintId),
      versionName: scope.sprintName,
      matchedOn: "sprint",
    };
  }
  return {
    projectKey: scope.projectKey,
    versionId: scope.versionId,
    versionName: scope.versionName,
    matchedOn: "version",
  };
}
