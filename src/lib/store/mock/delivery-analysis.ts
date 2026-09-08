import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
import type { DeliveryAnalysisData } from "@/lib/store/types";
import { OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/dimensions";

/** Snapshot aligned with Overview org leaf (31 blocked, 59% completion). */
const MOCK_DELIVERY_SNAPSHOT: DeliveryAnalysisSnapshot = {
  generatedAt: OVERVIEW_LAST_SYNC_AT,
  projectKeys: ["WEB", "MOB", "DATA", "INFRA"],
  siteUrl: "https://connexus.atlassian.net",
  rangeLabel: "Last 30 days",
  kpis: {
    healthScore: 48,
    healthScoreDelta: -6,
    openWork: 117,
    openWorkDelta: 8,
    blocked: 31,
    blockedDelta: 12,
    overdue: 16,
    overdueDelta: 4,
    spillover: 16,
    bugsOpen: 22,
    sprintCompletionPct: 59,
    resolvedLast7d: 14,
  },
  riskMix: {
    blocked: 31,
    overdue: 16,
    bugs: 22,
    otherOpen: 48,
  },
  trend: [
    { syncedAt: "2026-08-10T10:00:00Z", healthScore: 62, openWork: 98, blocked: 18, overdue: 9 },
    { syncedAt: "2026-08-17T10:00:00Z", healthScore: 55, openWork: 108, blocked: 24, overdue: 12 },
    { syncedAt: "2026-08-24T10:00:00Z", healthScore: 48, openWork: 117, blocked: 31, overdue: 16 },
  ],
  byProject: [
    {
      key: "WEB",
      name: "Web",
      healthScore: 44,
      openIssues: 42,
      blockedCount: 14,
      overdueCount: 7,
      spilloverCount: 6,
      bugsOpen: 9,
      activeSprint: { name: "Sprint 37", done: 22, committed: 38, pct: 58 },
    },
    {
      key: "MOB",
      name: "Mobile App",
      healthScore: 46,
      openIssues: 31,
      blockedCount: 11,
      overdueCount: 5,
      spilloverCount: 5,
      bugsOpen: 7,
      activeSprint: { name: "Sprint 37", done: 18, committed: 32, pct: 56 },
    },
    {
      key: "DATA",
      name: "Data Platform",
      healthScore: 61,
      openIssues: 24,
      blockedCount: 4,
      overdueCount: 2,
      spilloverCount: 3,
      bugsOpen: 4,
      activeSprint: { name: "Sprint 37", done: 16, committed: 24, pct: 67 },
    },
    {
      key: "INFRA",
      name: "Infrastructure",
      healthScore: 68,
      openIssues: 20,
      blockedCount: 2,
      overdueCount: 2,
      spilloverCount: 2,
      bugsOpen: 2,
      activeSprint: { name: "Sprint 37", done: 13, committed: 23, pct: 57 },
    },
  ],
  versions: [],
  sprints: [
    {
      projectKey: "WEB",
      projectName: "Web",
      name: "Sprint 37",
      state: "active",
      startDate: "2026-08-11",
      endDate: "2026-08-25",
      done: 22,
      committed: 38,
      pct: 58,
      severity: "warning",
    },
  ],
  signals: [
    {
      id: "sig-blocked",
      category: "blockers",
      label: "Blocked work elevated",
      value: "31 items blocked across WEB, MOB, DATA, INFRA",
      severity: "critical",
    },
    {
      id: "sig-spillover",
      category: "schedule",
      label: "Spillover risk",
      value: "16 items likely to spill into the next sprint",
      severity: "warning",
    },
  ],
  gaps: [
    {
      area: "Blocker ownership",
      gap: "14 WEB blocked issues lack an ETA in the evidence set",
      priority: "high",
    },
  ],
  scopeLabel: "Sprint 37",
  scopeMode: "sprint",
};

export const mockDeliveryAnalysis: DeliveryAnalysisData = {
  snapshot: MOCK_DELIVERY_SNAPSHOT,
};
