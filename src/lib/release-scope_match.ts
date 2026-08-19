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


