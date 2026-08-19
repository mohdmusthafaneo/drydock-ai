import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import type { ReleaseScope, ScopedMetrics } from "@/lib/release-scope_match";

type ProjectScope = JiraDeliverySnapshot["projects"][number];

export function snapshotProjects(
  snapshot: JiraDeliverySnapshot,
  projectKey: string,
): ProjectScope[] {
  const match = snapshot.projects.find((p) => p.key === projectKey);
  return match ? [match] : [];
}

function sprintMetricsFromProject(
  project: ProjectScope,
  sprint: NonNullable<ProjectScope["activeSprint"]>,
): ScopedMetrics {
  const committed = sprint.committed ?? 0;
  const done = sprint.done ?? 0;
  const openIssues = sprint.openIssues ?? Math.max(0, committed - done);
  const sprintCompletionPct =
    committed > 0 ? Math.round((done / committed) * 100) : null;

  return {
    openIssues,
    blockedCount: sprint.blockedCount ?? project.blockedCount ?? 0,
    overdueCount: sprint.overdueCount ?? project.overdueCount ?? 0,
    reopenedCount: sprint.reopenedCount ?? project.reopenedCount ?? 0,
    spilloverCount: sprint.spilloverCount ?? project.spilloverCount ?? 0,
    bugsOpen: sprint.bugsOpen ?? project.bugsOpen ?? 0,
    unassignedCount: sprint.unassignedCount ?? project.unassignedCount ?? 0,
    qaPipelineCount: sprint.qaPipelineCount ?? project.qaPipelineCount,
    sprintCompletionPct,
    scopeLabel: sprint.name,
  };
}

function fixVersionMetricsFromProject(
  project: ProjectScope,
  versionName: string,
): ScopedMetrics {
  const version = project.versions.find((v) => v.name === versionName);
  const openInVersion = version?.openIssuesInVersion ?? 0;

  return {
    openIssues: openInVersion,
    blockedCount: project.blockedCount,
    overdueCount: project.overdueCount,
    reopenedCount: project.reopenedCount ?? 0,
    spilloverCount: project.spilloverCount ?? 0,
    bugsOpen: project.bugsOpen,
    unassignedCount: project.unassignedCount,
    qaPipelineCount: project.qaPipelineCount,
    scopeLabel: versionName,
  };
}

function scopeLabelFromScope(scope: ReleaseScope): string {
  return scope.mode === "sprint" ? scope.sprintName : scope.versionName;
}

/** Extract scoped metrics from a delivery snapshot for the given release scope. */
export function scopedMetricsFromSnapshot(
  scope: ReleaseScope,
  snapshot: JiraDeliverySnapshot,
): ScopedMetrics {
  const project = snapshot.projects.find((p) => p.key === scope.projectKey);
  if (!project) {
    return {
      openIssues: 0,
      blockedCount: 0,
      overdueCount: 0,
      reopenedCount: 0,
      spilloverCount: 0,
      bugsOpen: 0,
      unassignedCount: 0,
      scopeLabel: scopeLabelFromScope(scope),
    };
  }

  if (scope.mode === "sprint") {
    const sprint = project.activeSprint;
    if (sprint) {
      return sprintMetricsFromProject(project, sprint);
    }
    return {
      openIssues: 0,
      blockedCount: 0,
      overdueCount: 0,
      reopenedCount: 0,
      spilloverCount: 0,
      bugsOpen: 0,
      unassignedCount: 0,
      scopeLabel: scope.sprintName,
    };
  }

  return fixVersionMetricsFromProject(project, scope.versionName);
}
