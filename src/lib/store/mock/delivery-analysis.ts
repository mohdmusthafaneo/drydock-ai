import type {
  DeliveryAnalysisSnapshot,
  DeliveryAnalysisSprintRow,
  DeliveryAnalysisVersionRow,
} from "@/lib/delivery-analysis/types";
import type {
  JiraDeliveryGap,
  JiraDeliverySignal,
} from "@/lib/jira-delivery-health";
import type { JiraHygieneFinding } from "@/lib/jira-hygiene";
import type { DeliveryAnalysisData } from "@/lib/store/types";
import { teamSprintKey } from "@/lib/store/dimensions";
import { OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/dimensions";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";
import { resolveMockScheduleRisk } from "@/lib/store/mock/schedule-risk";
import { computeSprintCardSeverity } from "@/lib/delivery-analysis/sprint-display";
import { toDateKey } from "@/lib/format-date";

const teams = TPT_OVERVIEW_DERIVED.teams;
const projectKey = TPT_OVERVIEW_DERIVED.projectKey;
const orgName = TPT_OVERVIEW_DERIVED.orgName;
const jiraSiteUrl = TPT_OVERVIEW_DERIVED.jiraSiteUrl;

type DerivedKpis = {
  score: number;
  completion: number;
  done: number;
  total: number;
  blocked: number;
  spillover: number;
  bugs: number;
};

type DerivedDeliveryExtras = {
  overdue: number;
  resolvedLast7d: number;
  statusBreakdown: { todo: number; inProgress: number; done: number };
  openIssues: number;
  missingDueDateInProgress: number;
  staleOpen: number;
  missingEstimates: number;
  unassigned: number;
  versions: ReadonlyArray<{
    id: string;
    name: string;
    released: boolean;
    releaseDate: string | null;
    overdue: boolean;
    openIssuesInVersion: number;
  }>;
};

function cloneKpis(raw: unknown): DerivedKpis {
  return JSON.parse(JSON.stringify(raw)) as DerivedKpis;
}

function sprintKpis(sprintId: string): DerivedKpis {
  if (sprintId === TPT_OVERVIEW_DERIVED.defaultSprintId) {
    return cloneKpis(TPT_OVERVIEW_DERIVED.base);
  }
  const entry =
    TPT_OVERVIEW_DERIVED.bySprint[
      sprintId as keyof typeof TPT_OVERVIEW_DERIVED.bySprint
    ];
  return cloneKpis(entry?.kpis ?? TPT_OVERVIEW_DERIVED.base);
}

function teamKpis(teamKey: string, sprintId: string): DerivedKpis {
  if (sprintId === TPT_OVERVIEW_DERIVED.defaultSprintId) {
    const row =
      TPT_OVERVIEW_DERIVED.byTeam[
        teamKey as keyof typeof TPT_OVERVIEW_DERIVED.byTeam
      ];
    if (row) return cloneKpis(row);
  }
  const key =
    `${teamKey}:${sprintId}` as keyof typeof TPT_OVERVIEW_DERIVED.byTeamSprint;
  const row = TPT_OVERVIEW_DERIVED.byTeamSprint[key];
  return row ? cloneKpis(row) : sprintKpis(sprintId);
}

function deliveryExtras(
  sprintId: string,
  teamKey?: string | null,
): DerivedDeliveryExtras {
  if (teamKey) {
    const key =
      `${teamKey}:${sprintId}` as keyof typeof TPT_OVERVIEW_DERIVED.deliveryByTeamSprint;
    const scoped = TPT_OVERVIEW_DERIVED.deliveryByTeamSprint[key];
    if (scoped) return scoped as DerivedDeliveryExtras;
  }
  return TPT_OVERVIEW_DERIVED.deliveryBySprint[
    sprintId as keyof typeof TPT_OVERVIEW_DERIVED.deliveryBySprint
  ] as DerivedDeliveryExtras;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function bandSeverity(
  value: number,
  warning: number,
  critical: number,
): "warning" | "critical" | null {
  if (value >= critical) return "critical";
  if (value >= warning) return "warning";
  return null;
}

function hygieneScore(findings: JiraHygieneFinding[]): number {
  const penalty =
    findings.filter((f) => f.severity === "critical").length * 10 +
    findings.filter((f) => f.severity === "warning").length * 4;
  return Math.max(0, Math.min(100, 100 - penalty));
}

function buildHygieneFindings(
  extras: DerivedDeliveryExtras,
): JiraHygieneFinding[] {
  const findings: JiraHygieneFinding[] = [];
  const open = extras.openIssues;
  const inProgress = extras.statusBreakdown.inProgress;

  if (inProgress > 0 && extras.missingDueDateInProgress > 0) {
    const dueRatio = ratio(extras.missingDueDateInProgress, inProgress);
    const severity = bandSeverity(dueRatio, 0.35, 0.55);
    if (severity) {
      findings.push({
        id: "missing-due-dates",
        category: "schedule",
        label: "In-progress without due date",
        value: `${Math.round(dueRatio * 100)}% of in-progress issues have no due date`,
        severity,
        recommendation:
          "Set due dates on active work so schedule risk and overdue signals stay meaningful.",
        projectKey,
      });
    }
  }

  if (extras.staleOpen >= 5 && open > 0) {
    const staleRatio = ratio(extras.staleOpen, open);
    const severity = bandSeverity(staleRatio, 0.15, 0.3);
    if (severity) {
      findings.push({
        id: "aged-open-tickets",
        category: "schedule",
        label: "Aged open tickets",
        value: `${extras.staleOpen} open issue${extras.staleOpen === 1 ? "" : "s"} older than 30 days (${Math.round(staleRatio * 100)}% of backlog)`,
        severity,
        recommendation:
          "Close or re-prioritize stale tickets — aged backlog inflates delivery risk.",
        projectKey,
      });
    }
  }

  if (extras.missingEstimates > 0 && open > 0) {
    const estimateRatio = ratio(extras.missingEstimates, open);
    const severity = bandSeverity(estimateRatio, 0.3, 0.5);
    if (severity) {
      findings.push({
        id: "missing-estimates",
        category: "estimates",
        label: "Missing estimates",
        value: `${Math.round(estimateRatio * 100)}% of open issues lack story points`,
        severity,
        recommendation:
          "Add story-point estimates so sprint and capacity signals are trustworthy.",
        projectKey,
      });
    }
  }

  if (extras.unassigned > 0 && open > 0) {
    const unassignedRatio = ratio(extras.unassigned, open);
    const severity = bandSeverity(unassignedRatio, 0.25, 0.4);
    if (severity) {
      findings.push({
        id: "high-unassigned",
        category: "assignment",
        label: "Unassigned work",
        value: `${Math.round(unassignedRatio * 100)}% of open issues have no assignee`,
        severity,
        recommendation:
          "Assign owners to open issues so delivery signals reflect accountability.",
        projectKey,
      });
    }
  }

  if (extras.overdue > 0 && open > 0) {
    const overdueRatio = ratio(extras.overdue, open);
    const severity = bandSeverity(overdueRatio, 0.2, 0.35);
    if (severity) {
      findings.push({
        id: "high-overdue",
        category: "schedule",
        label: "Overdue backlog",
        value: `${Math.round(overdueRatio * 100)}% of open issues are past due date`,
        severity,
        recommendation:
          "Update due dates or close stale tickets — overdue ratios inflate schedule risk.",
        projectKey,
      });
    }
  }

  return findings;
}

function buildSignals(input: {
  kpis: DerivedKpis;
  extras: DerivedDeliveryExtras;
  versions: DeliveryAnalysisVersionRow[];
  sprintName: string;
  sprintActive: boolean;
}): JiraDeliverySignal[] {
  const { kpis, extras, versions, sprintName, sprintActive } = input;
  const signals: JiraDeliverySignal[] = [];

  signals.push({
    id: "sig-blocked",
    category: "blockers",
    label: "Blocked work elevated",
    value:
      kpis.blocked > 0
        ? `${kpis.blocked} item${kpis.blocked === 1 ? "" : "s"} blocked across ${projectKey}`
        : `No blocked issues in ${projectKey}`,
    severity:
      kpis.blocked >= 10 ? "critical" : kpis.blocked > 0 ? "warning" : "info",
  });

  signals.push({
    id: "overdue-cluster",
    category: "schedule",
    label: "Overdue cluster",
    value:
      extras.overdue > 0
        ? `${extras.overdue} overdue issue${extras.overdue === 1 ? "" : "s"} in scope`
        : "No overdue issues in scope",
    severity:
      extras.overdue >= 10 ? "critical" : extras.overdue > 0 ? "warning" : "info",
  });

  signals.push({
    id: "bug-backlog",
    category: "quality",
    label: "Bug backlog",
    value: `${kpis.bugs} open bug${kpis.bugs === 1 ? "" : "s"} in scope`,
    severity: kpis.bugs >= 15 ? "critical" : kpis.bugs >= 5 ? "warning" : "info",
  });

  signals.push({
    id: "spillover",
    category: "schedule",
    label: "Sprint spillover",
    value:
      kpis.spillover > 0
        ? sprintActive
          ? `${kpis.spillover} item${kpis.spillover === 1 ? "" : "s"} likely to spill into the next sprint`
          : `${kpis.spillover} issue${kpis.spillover === 1 ? "" : "s"} unfinished when ${sprintName} closed`
        : "No sprint spillover in scope",
    severity:
      kpis.spillover >= 10 ? "critical" : kpis.spillover > 0 ? "warning" : "info",
  });

  const slipped = versions.filter((v) => v.overdue && !v.released);
  if (slipped.length > 0) {
    const preview = slipped
      .slice(0, 3)
      .map((v) => `${v.projectKey} · ${v.name}`)
      .join("; ");
    signals.push({
      id: "version-slip",
      category: "schedule",
      label: "Version slip",
      value:
        slipped.length === 1
          ? preview
          : `${slipped.length} overdue fix versions — ${preview}`,
      severity: "critical",
    });
  }

  return signals;
}

function buildGaps(input: {
  kpis: DerivedKpis;
  extras: DerivedDeliveryExtras;
  versions: DeliveryAnalysisVersionRow[];
  findings: JiraHygieneFinding[];
}): JiraDeliveryGap[] {
  const { kpis, extras, versions, findings } = input;
  const gaps: JiraDeliveryGap[] = [];

  if (kpis.blocked > 0) {
    gaps.push({
      area: "Blocker ownership",
      gap: `${kpis.blocked} blocked issue${kpis.blocked === 1 ? "" : "s"} in ${projectKey} lack an ETA in the evidence set`,
      priority: kpis.blocked >= 3 ? "high" : "medium",
    });
  }

  if (kpis.spillover > 0) {
    gaps.push({
      area: "Schedule",
      gap: `${kpis.spillover} open items are Highest/High priority or still To Do — review scope before sprint close`,
      priority: "high",
    });
  }

  if (extras.overdue > 0) {
    gaps.push({
      area: "Schedule",
      gap: `${extras.overdue} overdue issue${extras.overdue === 1 ? "" : "s"} in ${projectKey}`,
      priority: extras.overdue >= 5 ? "high" : "medium",
    });
  }

  for (const v of versions.filter((row) => row.overdue && !row.released)) {
    gaps.push({
      area: "Release",
      gap: `Fix version "${v.name}" (${v.projectKey}) is past target and not released`,
      priority: "high",
    });
  }

  if (findings.some((f) => f.id === "missing-due-dates")) {
    gaps.push({
      area: "Jira hygiene",
      gap: `Most in-progress ${projectKey} issues have no due date — schedule signals are directional until dates are set`,
      priority: "high",
    });
  }

  return gaps;
}

function sprintState(sprintId: string): DeliveryAnalysisSprintRow["state"] {
  const sprint = TPT_OVERVIEW_DERIVED.sprints.find((s) => s.id === sprintId);
  if (!sprint) return "future";
  if (sprintId === TPT_OVERVIEW_DERIVED.defaultSprintId) return "active";
  const current = TPT_OVERVIEW_DERIVED.sprints.find(
    (s) => s.id === TPT_OVERVIEW_DERIVED.defaultSprintId,
  );
  if (current && toDateKey(sprint.end) < toDateKey(current.start)) return "closed";
  return "future";
}

function versionRows(extras: DerivedDeliveryExtras): DeliveryAnalysisVersionRow[] {
  return extras.versions.map((v) => ({
    projectKey,
    projectName: orgName,
    id: v.id,
    name: v.name,
    released: v.released,
    releaseDate: v.releaseDate ?? undefined,
    overdue: v.overdue,
    openIssuesInVersion: v.openIssuesInVersion,
    jiraUrl: `${jiraSiteUrl}/issues/?jql=${encodeURIComponent(
      `project = "${projectKey}" AND fixVersion = "${v.name.replace(/"/g, '\\"')}"`,
    )}`,
  }));
}

function trendForSprint(sprintId: string, teamKey?: string | null) {
  const ids = TPT_OVERVIEW_DERIVED.sprints.map((s) => s.id) as string[];
  const ordered = [...ids].reverse();
  const idx = ordered.indexOf(sprintId);
  const window = (idx >= 0 ? ordered.slice(idx, idx + 3) : ordered.slice(0, 3)).reverse();
  return window.map((id) => {
    const kpis = teamKey ? teamKpis(teamKey, id) : sprintKpis(id);
    const extras = deliveryExtras(id, teamKey);
    const sprint = TPT_OVERVIEW_DERIVED.sprints.find((s) => s.id === id);
    return {
      syncedAt: sprint ? `${sprint.end}T10:00:00.000Z` : OVERVIEW_LAST_SYNC_AT,
      healthScore: kpis.score,
      openWork: kpis.total,
      blocked: kpis.blocked,
      overdue: extras.overdue,
    };
  });
}

/**
 * Sprint/team-aware Delivery snapshot from the TPT Jira export.
 */
export function buildMockDeliverySnapshot(
  sprintId?: string | null,
  teamKey?: string | null,
): DeliveryAnalysisSnapshot {
  const sid = sprintId ?? TPT_OVERVIEW_DERIVED.defaultSprintId;
  const sprint =
    TPT_OVERVIEW_DERIVED.sprints.find((s) => s.id === sid) ??
    TPT_OVERVIEW_DERIVED.sprints[0]!;
  const kpis = teamKey ? teamKpis(teamKey, sid) : sprintKpis(sid);
  const extras = deliveryExtras(sid, teamKey);
  const prevId =
    sid === "27" ? "26" : sid === "26" ? "25" : sid === "25" ? "24" : null;
  const prevKpis = prevId
    ? teamKey
      ? teamKpis(teamKey, prevId)
      : sprintKpis(prevId)
    : null;
  const prevExtras = prevId ? deliveryExtras(prevId, teamKey) : null;
  const versions = versionRows(extras);
  const findings = buildHygieneFindings(extras);
  const score = hygieneScore(findings);
  const hasCritical = findings.some((f) => f.severity === "critical");
  const sprintActive = sid === TPT_OVERVIEW_DERIVED.defaultSprintId;
  const scopedTeams = teamKey
    ? teams.filter((t) => t.key === teamKey)
    : teams;

  const byProject = scopedTeams.map((t) => {
    const teamSprintKpis = teamKpis(t.key, sid);
    const teamExtras = deliveryExtras(sid, t.key);
    return {
      key: t.key,
      name: t.name,
      healthScore: teamSprintKpis.score,
      openIssues: teamExtras.openIssues,
      blockedCount: teamSprintKpis.blocked,
      overdueCount: teamExtras.overdue,
      spilloverCount: teamSprintKpis.spillover,
      bugsOpen: teamSprintKpis.bugs,
      resolvedLast7d: teamExtras.resolvedLast7d,
      statusBreakdown: { ...teamExtras.statusBreakdown },
      activeSprint: {
        name: sprint.name,
        done: teamSprintKpis.done,
        committed: teamSprintKpis.total,
        pct: teamSprintKpis.completion,
      },
    };
  });

  const scheduleRisk = resolveMockScheduleRisk(sid, teamKey ?? null, {
    siteUrl: jiraSiteUrl,
  });

  return {
    generatedAt: OVERVIEW_LAST_SYNC_AT,
    projectKeys: scopedTeams.map((t) => t.key),
    siteUrl: jiraSiteUrl,
    rangeLabel: sprint.rangeLabel,
    kpis: {
      healthScore: kpis.score,
      healthScoreDelta: prevKpis ? kpis.score - prevKpis.score : undefined,
      openWork: kpis.total,
      openWorkDelta: prevKpis ? kpis.total - prevKpis.total : undefined,
      blocked: kpis.blocked,
      blockedDelta: prevKpis ? kpis.blocked - prevKpis.blocked : undefined,
      overdue: extras.overdue,
      overdueDelta: prevExtras ? extras.overdue - prevExtras.overdue : undefined,
      spillover: kpis.spillover,
      spilloverDelta: prevKpis ? kpis.spillover - prevKpis.spillover : undefined,
      bugsOpen: kpis.bugs,
      sprintCompletionPct: kpis.completion,
      resolvedLast7d: extras.resolvedLast7d,
    },
    riskMix: {
      blocked: kpis.blocked,
      overdue: extras.overdue,
      bugs: kpis.bugs,
      otherOpen: Math.max(
        0,
        extras.openIssues - kpis.blocked - extras.overdue - kpis.bugs,
      ),
    },
    trend: trendForSprint(sid, teamKey),
    byProject,
    versions,
    sprints: TPT_OVERVIEW_DERIVED.sprints.map((s) => {
      const rowKpis = sprintKpis(s.id);
        const state = sprintState(s.id);
      const pct = rowKpis.completion;
      return {
        projectKey,
        projectName: orgName,
        name: s.name,
        state,
        startDate: s.start,
        endDate: s.end,
        done: rowKpis.done,
        committed: rowKpis.total,
        pct,
        severity: computeSprintCardSeverity({
          pct,
          endDate: s.end,
          state,
          daysOverdue: 0,
        }),
        sprintId: Number.parseInt(s.id, 10),
      };
    }),
    signals: buildSignals({
      kpis,
      extras,
      versions,
      sprintName: sprint.name,
      sprintActive,
    }),
    gaps: buildGaps({ kpis, extras, versions, findings }),
    scheduleRisk,
    jiraHygiene:
      findings.length > 0
        ? {
            score,
            degradesTrust: score < 60 || hasCritical,
            worstProject: { key: projectKey, name: orgName },
            findings,
          }
        : undefined,
    scopeLabel: sprint.name,
    scopeMode: "sprint",
  };
}

export function buildMockDeliveryAnalysis(): DeliveryAnalysisData {
  const defaultId = TPT_OVERVIEW_DERIVED.defaultSprintId;
  const byTeam: NonNullable<DeliveryAnalysisData["byTeam"]> = {};
  const bySprint: NonNullable<DeliveryAnalysisData["bySprint"]> = {};
  const byTeamSprint: NonNullable<DeliveryAnalysisData["byTeamSprint"]> = {};

  for (const team of teams) {
    byTeam[team.key] = buildMockDeliverySnapshot(defaultId, team.key);
  }
  for (const sprint of TPT_OVERVIEW_DERIVED.sprints) {
    bySprint[sprint.id] = buildMockDeliverySnapshot(sprint.id);
  }
  for (const team of teams) {
    for (const sprint of TPT_OVERVIEW_DERIVED.sprints) {
      byTeamSprint[teamSprintKey(team.key, sprint.id)] =
        buildMockDeliverySnapshot(sprint.id, team.key);
    }
  }

  return {
    base: buildMockDeliverySnapshot(defaultId),
    byTeam,
    bySprint,
    byTeamSprint,
  };
}

export const mockDeliveryAnalysis: DeliveryAnalysisData =
  buildMockDeliveryAnalysis();
