import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import {
  resolveJiraMappingForProject,
  type ToolchainMapping,
} from "@/lib/toolchain-mapping";

export type JiraHygieneFinding = {
  id: string;
  category:
    | "assignment"
    | "schedule"
    | "traceability"
    | "sprint"
    | "freshness"
    | "estimates"
    | "data-quality";
  label: string;
  value: string;
  severity: "info" | "warning" | "critical";
  recommendation: string;
  projectKey?: string;
  jiraUrl?: string;
};

export type JiraHygieneResult = {
  score: number;
  grade: "good" | "fair" | "poor";
  degradesTrust: boolean;
  findings: JiraHygieneFinding[];
};

export type PortfolioJiraHygiene = {
  computedAt: string;
  portfolioScore: number;
  degradesTrust: boolean;
  worstProject?: { key: string; name: string; score: number };
  byProject: Record<string, JiraHygieneResult>;
};

export type PortfolioHygieneSummary = {
  portfolioScore: number;
  degradesTrust: boolean;
  worstProject?: { key: string; name: string };
  topFindings: JiraHygieneFinding[];
};

export type JiraHygieneSnapshot = PortfolioJiraHygiene;

type ProjectScope = JiraDeliverySnapshot["projects"][number];

const STALE_SYNC_HOURS = 48;
const CRITICAL_STALE_HOURS = 96;
const STALE_OPEN_THRESHOLD = 5;

function hygieneGrade(score: number): JiraHygieneResult["grade"] {
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

function computeHygieneScore(findings: JiraHygieneFinding[]): number {
  const penalty =
    findings.filter((f) => f.severity === "critical").length * 10 +
    findings.filter((f) => f.severity === "warning").length * 4;
  return Math.max(0, Math.min(100, 100 - penalty));
}

function syncAgeHours(syncedAt: string): number {
  return (Date.now() - new Date(syncedAt).getTime()) / 3600000;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function baselineSeverity(
  ratioValue: number,
  baselineP50: number | undefined,
  defaults: { warning: number; critical: number },
): "warning" | "critical" | null {
  if (baselineP50 != null && baselineP50 >= 0) {
    const warningThreshold = Math.max(baselineP50 * 1.35, baselineP50 + 0.08, defaults.warning);
    const criticalThreshold = Math.max(baselineP50 * 1.75, baselineP50 + 0.18, defaults.critical);
    if (ratioValue >= criticalThreshold) return "critical";
    if (ratioValue >= warningThreshold) return "warning";
    return null;
  }
  if (ratioValue >= defaults.critical) return "critical";
  if (ratioValue >= defaults.warning) return "warning";
  return null;
}

function buildHygieneFindings(input: {
  project: ProjectScope;
  mapping?: NonNullable<ToolchainMapping["jira"]>;
  snapshotSyncedAt: string;
  traceabilityGap?: boolean;
  dataQualityFlags?: string[];
}): JiraHygieneFinding[] {
  const { project, mapping, snapshotSyncedAt, traceabilityGap, dataQualityFlags } = input;
  const findings: JiraHygieneFinding[] = [];

  if (project.openIssues > 0) {
    const unassignedRatio = ratio(project.unassignedCount, project.openIssues);
    const unassignedSeverity = baselineSeverity(unassignedRatio, mapping?.hygieneBaselines?.unassignedRatioP50, {
      warning: 0.25,
      critical: 0.4,
    });
    if (unassignedSeverity) {
      findings.push({
        id: "high-unassigned",
        category: "assignment",
        label: "Unassigned work",
        value: `${Math.round(unassignedRatio * 100)}% of open issues have no assignee`,
        severity: unassignedSeverity,
        recommendation: "Assign owners to open issues so delivery signals reflect accountability.",
      });
    }

    const overdueRatio = ratio(project.overdueCount, project.openIssues);
    const overdueSeverity = baselineSeverity(overdueRatio, mapping?.hygieneBaselines?.overdueRatioP50, {
      warning: 0.2,
      critical: 0.35,
    });
    if (overdueSeverity) {
      findings.push({
        id: "high-overdue",
        category: "schedule",
        label: "Overdue backlog",
        value: `${Math.round(overdueRatio * 100)}% of open issues are past due date`,
        severity: overdueSeverity,
        recommendation: "Update due dates or close stale tickets — overdue ratios inflate schedule risk.",
      });
    }

    if (
      project.missingEstimateCount != null &&
      project.openIssues > 0
    ) {
      const estimateRatio = ratio(project.missingEstimateCount, project.openIssues);
      const estimateSeverity = baselineSeverity(
        estimateRatio,
        mapping?.hygieneBaselines?.missingEstimateRatioP50,
        { warning: 0.3, critical: 0.5 },
      );
      if (estimateSeverity) {
        findings.push({
          id: "missing-estimates",
          category: "estimates",
          label: "Missing estimates",
          value: `${Math.round(estimateRatio * 100)}% of open issues lack story points`,
          severity: estimateSeverity,
          recommendation:
            "Add story-point estimates so sprint and capacity signals are trustworthy.",
        });
      }
    }

    const inProgress =
      project.statusBreakdown?.inProgress ?? project.openIssues;
    if (
      project.missingDueDateCount != null &&
      inProgress > 0
    ) {
      const dueDateRatio = ratio(project.missingDueDateCount, inProgress);
      const dueDateSeverity = baselineSeverity(dueDateRatio, undefined, {
        warning: 0.35,
        critical: 0.55,
      });
      if (dueDateSeverity) {
        findings.push({
          id: "missing-due-dates",
          category: "schedule",
          label: "In-progress without due date",
          value: `${Math.round(dueDateRatio * 100)}% of in-progress issues have no due date`,
          severity: dueDateSeverity,
          recommendation:
            "Set due dates on active work so schedule risk and overdue signals stay meaningful.",
        });
      }
    }

    if (
      project.staleOpenCount != null &&
      project.openIssues > 0 &&
      project.staleOpenCount >= STALE_OPEN_THRESHOLD
    ) {
      const staleRatio = ratio(project.staleOpenCount, project.openIssues);
      const staleSeverity = baselineSeverity(staleRatio, undefined, {
        warning: 0.15,
        critical: 0.3,
      });
      if (staleSeverity) {
        findings.push({
          id: "aged-open-tickets",
          category: "schedule",
          label: "Aged open tickets",
          value: `${project.staleOpenCount} open issue${project.staleOpenCount === 1 ? "" : "s"} older than 30 days (${Math.round(staleRatio * 100)}% of backlog)`,
          severity: staleSeverity,
          recommendation:
            "Close or re-prioritize stale tickets — aged backlog inflates delivery risk.",
        });
      }
    }

    if (project.unknownWorkflowStatusCount != null && project.unknownWorkflowStatusCount > 0) {
      findings.push({
        id: "unknown-status-vs-workflow",
        category: "data-quality",
        label: "Unknown workflow statuses",
        value: `${project.unknownWorkflowStatusCount} open issue${project.unknownWorkflowStatusCount === 1 ? "" : "s"} in non-standard status categories`,
        severity: project.unknownWorkflowStatusCount >= 5 ? "critical" : "warning",
        recommendation:
          "Align custom statuses with your agreed workflow mapping so blockers and done states are detected correctly.",
      });
    }
  }

  const projectJqlFailures = project.jqlPartialFailures ?? [];
  const portfolioFlags = dataQualityFlags ?? [];
  const qualityFlags = [...new Set([...projectJqlFailures, ...portfolioFlags])];
  if (qualityFlags.length > 0) {
    findings.push({
      id: "jql-partial-failure",
      category: "data-quality",
      label: "Partial Jira data",
      value: `Some counts unavailable: ${qualityFlags.slice(0, 3).join(", ")}${qualityFlags.length > 3 ? "…" : ""}`,
      severity: qualityFlags.length >= 3 ? "critical" : "warning",
      recommendation: "Re-sync Jira or review field mapping — some delivery metrics may be incomplete.",
    });
  }

  const ageHours = syncAgeHours(snapshotSyncedAt);
  if (ageHours > CRITICAL_STALE_HOURS) {
    findings.push({
      id: "stale-sync",
      category: "freshness",
      label: "Stale Jira sync",
      value: `Last synced ${Math.floor(ageHours)}h ago`,
      severity: "critical",
      recommendation: "Re-sync Jira before using these numbers in release decisions.",
    });
  } else if (ageHours > STALE_SYNC_HOURS) {
    findings.push({
      id: "stale-sync",
      category: "freshness",
      label: "Stale Jira sync",
      value: `Last synced ${Math.floor(ageHours)}h ago`,
      severity: "warning",
      recommendation: "Re-sync Jira before using these numbers in release decisions.",
    });
  }

  const usesSprints = mapping?.usesSprints ?? false;
  const boardType = project.board?.type ?? mapping?.boardType;
  if (usesSprints && boardType === "scrum" && !project.activeSprint) {
    findings.push({
      id: "scrum-no-sprint",
      category: "sprint",
      label: "No active sprint",
      value: `${project.key} uses Scrum but has no active sprint`,
      severity: "warning",
      recommendation: "Start or plan a sprint so velocity and commitment metrics are meaningful.",
    });
  }

  if (mapping?.releaseTracking === "fixVersion") {
    const unreleased = project.versions.filter((v) => !v.released);
    if (unreleased.length > 0) {
      const taggedTotal = unreleased.reduce(
        (n, v) => n + (v.openIssuesInVersion ?? 0),
        0,
      );
      if (taggedTotal === 0) {
        findings.push({
          id: "fixversion-not-used",
          category: "traceability",
          label: "Fix versions unused",
          value: `${unreleased.length} unreleased version(s) with no tagged open issues`,
          severity: "warning",
          recommendation:
            "Tag issues to fix versions so release readiness can be traced to Jira.",
        });
      }
    }
  }

  if (traceabilityGap) {
    findings.push({
      id: "traceability-gap",
      category: "traceability",
      label: "Release traceability gap",
      value: "No fix version or sprint match for this release scope",
      severity: "warning",
      recommendation:
        "Align release name/version with a Jira fix version or active sprint per your agreed workflow.",
    });
  }

  return findings;
}

function finalizeHygieneResult(findings: JiraHygieneFinding[]): JiraHygieneResult {
  const score = computeHygieneScore(findings);
  const hasCritical = findings.some((f) => f.severity === "critical");
  return {
    score,
    grade: hygieneGrade(score),
    degradesTrust: score < 60 || hasCritical,
    findings,
  };
}

/** Single-project Jira board hygiene — data trust, not delivery health. */
export function assessJiraHygiene(input: {
  project: ProjectScope;
  mapping?: NonNullable<ToolchainMapping["jira"]>;
  snapshotSyncedAt: string;
  traceabilityGap?: boolean;
  dataQualityFlags?: string[];
}): JiraHygieneResult {
  const findings = buildHygieneFindings(input);
  return finalizeHygieneResult(findings);
}

/** Cap delivery/readiness scores when Jira board hygiene degrades trust. */
export function applyHygieneScoreDiscount(
  score: number,
  hygiene?: { degradesTrust: boolean; portfolioScore?: number } | null,
): number {
  if (!hygiene?.degradesTrust) return score;
  const cap = (hygiene.portfolioScore ?? 100) < 40 ? 55 : 65;
  return Math.min(score, cap);
}

/** Portfolio rollup — leadership surfaces worst project (min score). */
export function assessPortfolioJiraHygiene(
  snapshot: JiraDeliverySnapshot,
  mapping: ToolchainMapping | null | undefined,
  options?: { traceabilityGapByProject?: Record<string, boolean> },
): PortfolioJiraHygiene {
  const byProject: Record<string, JiraHygieneResult> = {};
  let portfolioScore = 100;
  let worstProject: PortfolioJiraHygiene["worstProject"];
  let degradesTrust = false;

  for (const project of snapshot.projects) {
    const projectMapping = resolveJiraMappingForProject(mapping, project.key) ?? mapping?.jira;
    const result = assessJiraHygiene({
      project,
      mapping: projectMapping,
      snapshotSyncedAt: snapshot.syncedAt,
      traceabilityGap: options?.traceabilityGapByProject?.[project.key],
      dataQualityFlags: snapshot.dataQualityFlags,
    });
    byProject[project.key] = result;
    portfolioScore = Math.min(portfolioScore, result.score);
    if (result.degradesTrust) degradesTrust = true;
    if (!worstProject || result.score < worstProject.score) {
      worstProject = { key: project.key, name: project.name, score: result.score };
    }
  }

  return {
    computedAt: new Date().toISOString(),
    portfolioScore,
    degradesTrust,
    worstProject,
    byProject,
  };
}

export function summarizePortfolioHygiene(
  hygiene: PortfolioJiraHygiene | null | undefined,
  projectKey?: string | null,
): PortfolioHygieneSummary | null {
  if (!hygiene) return null;

  const projectResult = projectKey ? hygiene.byProject[projectKey] : undefined;
  const portfolioScore = projectResult?.score ?? hygiene.portfolioScore;
  const degradesTrust = projectResult?.degradesTrust ?? hygiene.degradesTrust;

  const findingsSource = projectKey
    ? projectResult
      ? [{ projectKey, findings: projectResult.findings }]
      : []
    : Object.entries(hygiene.byProject).map(([key, r]) => ({
        projectKey: key,
        findings: r.findings,
      }));

  const allFindings = findingsSource.flatMap(({ projectKey: pk, findings }) =>
    findings.map((f) => ({ ...f, projectKey: pk })),
  );
  const severityRank = { critical: 0, warning: 1, info: 2 };
  const topFindings = [...allFindings]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 3);

  return {
    portfolioScore,
    degradesTrust,
    worstProject:
      projectKey && projectResult
        ? { key: projectKey, name: projectKey }
        : hygiene.worstProject
          ? { key: hygiene.worstProject.key, name: hygiene.worstProject.name }
          : undefined,
    topFindings,
  };
}

export function resolveLowJiraHygieneForRelease(input: {
  hygiene: PortfolioJiraHygiene | null | undefined;
  projectKey?: string | null;
}): boolean {
  if (!input.hygiene) return false;
  if (input.projectKey) {
    const project = input.hygiene.byProject[input.projectKey];
    return project?.degradesTrust ?? false;
  }
  return input.hygiene.degradesTrust;
}
