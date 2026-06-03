import type { Integration } from "@/generated/prisma/client";
import {
  isJiraOAuthConnected,
  parseJiraMeta,
  type JiraDeliverySnapshot,
} from "@/lib/jira-meta";

export type JiraDeliverySignal = {
  id: string;
  category: "blockers" | "schedule" | "quality" | "sprint";
  label: string;
  value: string;
  severity: "info" | "warning" | "critical";
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
  matchedOn: "releaseName" | "version" | "combined";
};

export type JiraDeliveryHealth = {
  score: number;
  signals: JiraDeliverySignal[];
  gaps: JiraDeliveryGap[];
  matchedVersion?: JiraVersionMatch;
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

export function matchReleaseToFixVersion(
  releaseName: string,
  version: string | null | undefined,
  snapshot: JiraDeliverySnapshot,
): JiraVersionMatch | undefined {
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
      bugsOpen: acc.bugsOpen + p.bugsOpen,
      unassignedCount: acc.unassignedCount + p.unassignedCount,
    }),
    { openIssues: 0, blockedCount: 0, overdueCount: 0, bugsOpen: 0, unassignedCount: 0 },
  );
}

export function analyzeJiraDeliveryHealth(input: {
  snapshot: JiraDeliverySnapshot;
  releaseName: string;
  version?: string | null;
}): JiraDeliveryHealth {
  const matchedVersion = matchReleaseToFixVersion(
    input.releaseName,
    input.version,
    input.snapshot,
  );
  const scopedProject = pickProjectScope(input.snapshot, matchedVersion);
  const metrics = scopedProject
    ? {
        openIssues: scopedProject.openIssues,
        blockedCount: scopedProject.blockedCount,
        overdueCount: scopedProject.overdueCount,
        bugsOpen: scopedProject.bugsOpen,
        unassignedCount: scopedProject.unassignedCount,
      }
    : aggregateMetrics(input.snapshot.projects);

  const matchedFixVersion =
    matchedVersion && scopedProject
      ? scopedProject.versions.find((v) => v.id === matchedVersion.versionId)
      : undefined;

  const signals: JiraDeliverySignal[] = [
    {
      id: "jira-blocked",
      category: "blockers",
      label: "Blocked issues",
      value:
        metrics.blockedCount > 0
          ? `${metrics.blockedCount} open blocked issue${metrics.blockedCount === 1 ? "" : "s"}`
          : "No blocked issues in scope",
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
      label: "Open bugs",
      value: `${metrics.bugsOpen} open bug${metrics.bugsOpen === 1 ? "" : "s"} in scope`,
      severity:
        metrics.bugsOpen >= 15
          ? "critical"
          : metrics.bugsOpen >= 5
            ? "warning"
            : "info",
    },
  ];

  if (matchedFixVersion) {
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
  }

  const sprint = scopedProject?.activeSprint;
  if (sprint && sprint.committed != null && sprint.committed > 0) {
    const done = sprint.done ?? 0;
    const pct = Math.round((done / sprint.committed) * 100);
    signals.push({
      id: "jira-sprint",
      category: "sprint",
      label: "Active sprint",
      value: `${sprint.name}: ${done}/${sprint.committed} done (${pct}%)`,
      severity: pct < 40 ? "critical" : pct < 60 ? "warning" : "info",
    });
  }

  const gaps: JiraDeliveryGap[] = [];

  if (!matchedVersion && input.snapshot.projects.length > 0) {
    gaps.push({
      area: "Traceability",
      gap: `Release "${input.releaseName}"${input.version ? ` (${input.version})` : ""} not matched to a Jira fix version`,
      priority: "medium",
    });
  }

  if (metrics.blockedCount > 0) {
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
      gap: `${metrics.bugsOpen} open bugs in Jira scope`,
      priority: metrics.bugsOpen >= 10 ? "high" : "medium",
    });
  }

  if (matchedFixVersion?.overdue && !matchedFixVersion.released) {
    gaps.push({
      area: "Release",
      gap: `Fix version "${matchedFixVersion.name}" is past target date and not released`,
      priority: "high",
    });
  }

  if (sprint && sprint.committed != null && sprint.committed > 0) {
    const done = sprint.done ?? 0;
    const pct = done / sprint.committed;
    if (pct < 0.5) {
      gaps.push({
        area: "Sprint",
        gap: `Sprint "${sprint.name}" below 50% completion (${Math.round(pct * 100)}%)`,
        priority: pct < 0.3 ? "high" : "medium",
      });
    }
  }

  const penalty =
    gaps.filter((g) => g.priority === "high").length * 14 +
    gaps.filter((g) => g.priority === "medium").length * 7 +
    gaps.filter((g) => g.priority === "low").length * 3 +
    signals.filter((s) => s.severity === "critical").length * 10 +
    signals.filter((s) => s.severity === "warning").length * 4;

  const score = Math.max(0, Math.min(100, 92 - penalty));

  return {
    score,
    signals,
    gaps,
    matchedVersion,
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
    }),
  };
}
