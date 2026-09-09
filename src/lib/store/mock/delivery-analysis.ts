import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
import type { DeliveryAnalysisData } from "@/lib/store/types";
import { OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/dimensions";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";
import { computeSprintCardSeverity } from "@/lib/delivery-analysis/sprint-display";
import { toDateKey } from "@/lib/format-date";

const base = TPT_OVERVIEW_DERIVED.base;
const sprint27 = TPT_OVERVIEW_DERIVED.sprints.find((s) => s.id === "27")!;
const teams = TPT_OVERVIEW_DERIVED.teams;
const projectKey = TPT_OVERVIEW_DERIVED.projectKey;
const scheduleRisk27 = TPT_OVERVIEW_DERIVED.scheduleRiskBySprint["27"];

function teamKpis(key: string) {
  return TPT_OVERVIEW_DERIVED.byTeam[key as keyof typeof TPT_OVERVIEW_DERIVED.byTeam]!;
}

/** Snapshot aligned with TPT Overview org leaf (selected sprint + teams). */
const MOCK_DELIVERY_SNAPSHOT: DeliveryAnalysisSnapshot = {
  generatedAt: OVERVIEW_LAST_SYNC_AT,
  projectKeys: teams.map((t) => t.key),
  siteUrl: "https://aidos.atlassian.net",
  rangeLabel: sprint27.rangeLabel,
  kpis: {
    healthScore: base.score,
    healthScoreDelta: -12,
    openWork: base.total,
    openWorkDelta: 18,
    blocked: base.blocked,
    blockedDelta: 15,
    overdue: 8,
    overdueDelta: 3,
    spillover: base.spillover,
    bugsOpen: base.bugs,
    sprintCompletionPct: base.completion,
    resolvedLast7d: 21,
  },
  riskMix: {
    blocked: base.blocked,
    overdue: 8,
    bugs: base.bugs,
    otherOpen: Math.max(0, base.total - base.done - base.blocked - 8 - base.bugs),
  },
  trend: [
    { syncedAt: "2026-08-18T10:00:00Z", healthScore: 42, openWork: 210, blocked: 8, overdue: 4 },
    { syncedAt: "2026-08-28T10:00:00Z", healthScore: 28, openWork: 230, blocked: 12, overdue: 6 },
    { syncedAt: OVERVIEW_LAST_SYNC_AT, healthScore: base.score, openWork: base.total, blocked: base.blocked, overdue: 8 },
  ],
  byProject: teams.map((t) => {
    const k = teamKpis(t.key);
    return {
      key: t.key,
      name: t.name,
      healthScore: k.score,
      openIssues: k.total - k.done,
      blockedCount: k.blocked,
      overdueCount: Math.max(0, Math.round(k.spillover / 4)),
      spilloverCount: k.spillover,
      bugsOpen: k.bugs,
      activeSprint: {
        name: sprint27.name,
        done: k.done,
        committed: k.total,
        pct: k.completion,
      },
    };
  }),
  versions: [],
  sprints: TPT_OVERVIEW_DERIVED.sprints.map((s) => {
    const entry =
      TPT_OVERVIEW_DERIVED.bySprint[
        s.id as keyof typeof TPT_OVERVIEW_DERIVED.bySprint
      ];
    const kpis = entry?.kpis ?? base;
    const state =
      s.id === TPT_OVERVIEW_DERIVED.defaultSprintId
        ? "active"
        : toDateKey(s.end) < toDateKey(sprint27.start)
          ? "closed"
          : "future";
    const pct = kpis.completion;
    return {
      projectKey,
      projectName: TPT_OVERVIEW_DERIVED.orgName,
      name: s.name,
      state,
      startDate: s.start,
      endDate: s.end,
      done: kpis.done,
      committed: kpis.total,
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
  signals: [
    {
      id: "sig-blocked",
      category: "blockers",
      label: "Blocked work elevated",
      value: `${base.blocked} items blocked across teams in ${projectKey}`,
      severity: "critical",
    },
    {
      id: "sig-spillover",
      category: "schedule",
      label: "Spillover risk",
      value: `${base.spillover} items likely to spill into the next sprint`,
      severity: "warning",
    },
  ],
  gaps: [
    {
      area: "Blocker ownership",
      gap: `${base.blocked} blocked issues lack an ETA in the evidence set`,
      priority: "high",
    },
    {
      area: "Schedule",
      gap: `${base.spillover} open items are Highest/High priority or still To Do — review scope before sprint close`,
      priority: "high",
    },
  ],
  scheduleRisk: {
    definition: scheduleRisk27.definition,
    total: scheduleRisk27.total,
    byTeam: scheduleRisk27.byTeam.map((t) => ({ ...t })),
  },
  scopeLabel: sprint27.name,
  scopeMode: "sprint",
};

export const mockDeliveryAnalysis: DeliveryAnalysisData = {
  snapshot: MOCK_DELIVERY_SNAPSHOT,
};
