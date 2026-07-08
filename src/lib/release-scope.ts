import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";

export type ReleaseScope =
  | { mode: "sprint"; projectKey: string; sprintId: number; sprintName: string }
  | { mode: "fixVersion"; projectKey: string; versionId: string; versionName: string };

export type ScopedMetrics = {
  openIssues: number;
  blockedCount: number;
  overdueCount: number;
  reopenedCount: number;
  spilloverCount: number;
  bugsOpen: number;
  unassignedCount: number;
  qaPipelineCount?: number;
  sprintCompletionPct?: number | null;
  scopeLabel: string;
};

type ProjectScope = JiraDeliverySnapshot["projects"][number];

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[\s._-]+/g, "");
}

function findProject(
  snapshot: JiraDeliverySnapshot,
  projectKey?: string | null,
): ProjectScope | undefined {
  if (projectKey) {
    return snapshot.projects.find((p) => p.key === projectKey);
  }
  if (snapshot.projects.length === 1) {
    return snapshot.projects[0];
  }
  return undefined;
}

function matchSprintById(
  snapshot: JiraDeliverySnapshot,
  sprintId: number,
): ReleaseScope | null {
  for (const project of snapshot.projects) {
    const sprint = project.activeSprint;
    if (sprint?.id === sprintId) {
      return {
        mode: "sprint",
        projectKey: project.key,
        sprintId: sprint.id,
        sprintName: sprint.name,
      };
    }
  }
  return null;
}

function matchSprintByName(
  snapshot: JiraDeliverySnapshot,
  releaseName: string,
  version?: string | null,
): ReleaseScope | null {
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
          mode: "sprint",
          projectKey: project.key,
          sprintId: sprint.id,
          sprintName: sprint.name,
        };
      }
    }
  }
  return null;
}

function matchFixVersion(
  snapshot: JiraDeliverySnapshot,
  fixVersion: string,
  projectKey?: string | null,
): ReleaseScope | null {
  const target = fixVersion.trim();
  const targetNorm = normalizeLabel(target);
  const projects = projectKey
    ? snapshot.projects.filter((p) => p.key === projectKey)
    : snapshot.projects;

  for (const project of projects) {
    for (const version of project.versions) {
      const versionNorm = normalizeLabel(version.name);
      if (versionNorm === targetNorm || version.name === target) {
        return {
          mode: "fixVersion",
          projectKey: project.key,
          versionId: version.id,
          versionName: version.name,
        };
      }
    }
  }
  return null;
}

/** Resolve release scope for a specific release row or assess context. */
export function resolveReleaseScope(input: {
  snapshot: JiraDeliverySnapshot;
  releaseTracking?: NonNullable<ToolchainMapping["jira"]>["releaseTracking"];
  jiraSprintId?: number | null;
  jiraFixVersion?: string | null;
  releaseName?: string;
  version?: string | null;
  projectKey?: string | null;
}): ReleaseScope | null {
  const tracking = input.releaseTracking ?? "fixVersion";

  if (input.jiraSprintId != null) {
    const byId = matchSprintById(input.snapshot, input.jiraSprintId);
    if (byId) return byId;
  }

  if (input.jiraFixVersion?.trim()) {
    const byFv = matchFixVersion(
      input.snapshot,
      input.jiraFixVersion,
      input.projectKey,
    );
    if (byFv) return byFv;
  }

  if (tracking === "sprint") {
    if (input.releaseName) {
      const byName = matchSprintByName(
        input.snapshot,
        input.releaseName,
        input.version,
      );
      if (byName) return byName;
    }
    const project = findProject(input.snapshot, input.projectKey);
    const sprint = project?.activeSprint;
    if (sprint) {
      return {
        mode: "sprint",
        projectKey: project!.key,
        sprintId: sprint.id,
        sprintName: sprint.name,
      };
    }
  }

  if (tracking === "fixVersion" && input.releaseName) {
    const candidates = [input.version?.trim(), input.releaseName.trim()].filter(
      Boolean,
    ) as string[];
    for (const candidate of candidates) {
      const match = matchFixVersion(input.snapshot, candidate, input.projectKey);
      if (match) return match;
    }
  }

  return null;
}

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

function snapshotProjects(
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
    blockedCount: sprint.blockedCount ?? 0,
    overdueCount: sprint.overdueCount ?? 0,
    reopenedCount: sprint.reopenedCount ?? 0,
    spilloverCount: sprint.spilloverCount ?? project.spilloverCount ?? 0,
    bugsOpen: sprint.bugsOpen ?? 0,
    unassignedCount: sprint.unassignedCount ?? 0,
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
