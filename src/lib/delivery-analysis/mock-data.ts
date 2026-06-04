import {
  computeDeliveryAnalysisSnapshot,
  filterSnapshotProjects,
} from "@/lib/delivery-analysis/compute-snapshot";
import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisSnapshot,
  DeliveryAnalysisTrendPoint,
} from "@/lib/delivery-analysis/types";
import type { JiraDeliveryGap, JiraDeliverySignal } from "@/lib/jira-delivery-health";

const MOCK_SITE_URL = "https://aidos-demo.atlassian.net";

const MOCK_PROJECTS = [
  {
    key: "PLAT",
    name: "Platform Core",
    healthScore: 82,
    openIssues: 58,
    blockedCount: 2,
    overdueCount: 4,
    bugsOpen: 6,
    resolvedLast7d: 24,
    statusBreakdown: { todo: 22, inProgress: 28, done: 412 },
    activeSprint: { name: "PLAT Sprint 24", done: 18, committed: 26, pct: 69 },
    sprint: {
      name: "PLAT Sprint 24",
      state: "active",
      startDate: "2026-05-19",
      endDate: "2026-06-02",
      done: 18,
      committed: 26,
      pct: 69,
      severity: "info" as const,
    },
    versions: [
      {
        id: "v1",
        name: "2026.06 Platform",
        released: false,
        releaseDate: "2026-06-15",
        overdue: false,
        openIssuesInVersion: 34,
      },
      {
        id: "v2",
        name: "2026.05 Hotfix",
        released: true,
        releaseDate: "2026-05-10",
      },
    ],
  },
  {
    key: "WEB",
    name: "Web Client",
    healthScore: 71,
    openIssues: 47,
    blockedCount: 3,
    overdueCount: 5,
    bugsOpen: 8,
    resolvedLast7d: 19,
    statusBreakdown: { todo: 18, inProgress: 21, done: 286 },
    activeSprint: { name: "WEB Sprint 12", done: 9, committed: 22, pct: 41 },
    sprint: {
      name: "WEB Sprint 12",
      state: "active",
      startDate: "2026-05-26",
      endDate: "2026-06-09",
      done: 9,
      committed: 22,
      pct: 41,
      severity: "warning" as const,
    },
    versions: [
      {
        id: "v3",
        name: "2.4.0",
        released: false,
        releaseDate: "2026-05-28",
        overdue: true,
        openIssuesInVersion: 41,
      },
      {
        id: "v4",
        name: "2.3.2",
        released: true,
        releaseDate: "2026-04-20",
      },
    ],
  },
  {
    key: "API",
    name: "API Gateway",
    healthScore: 79,
    openIssues: 37,
    blockedCount: 1,
    overdueCount: 2,
    bugsOpen: 4,
    resolvedLast7d: 15,
    statusBreakdown: { todo: 11, inProgress: 14, done: 198 },
    activeSprint: { name: "API Sprint 8", done: 14, committed: 18, pct: 78 },
    sprint: {
      name: "API Sprint 8",
      state: "active",
      startDate: "2026-05-19",
      endDate: "2026-06-02",
      done: 14,
      committed: 18,
      pct: 78,
      severity: "info" as const,
    },
    versions: [
      {
        id: "v5",
        name: "v1.12",
        released: false,
        releaseDate: "2026-06-20",
        overdue: false,
        openIssuesInVersion: 22,
      },
    ],
  },
];

const MOCK_SIGNALS: JiraDeliverySignal[] = [
  {
    id: "portfolio-blocked",
    category: "blockers",
    label: "Portfolio blocked work",
    value: "6 blocked issues across 3 projects",
    severity: "warning",
  },
  {
    id: "overdue-cluster",
    category: "schedule",
    label: "Overdue cluster",
    value: "11 overdue issues · WEB most affected",
    severity: "warning",
  },
  {
    id: "version-slip",
    category: "schedule",
    label: "Version slip",
    value: "WEB · 2.4.0 past target date",
    severity: "critical",
  },
  {
    id: "sprint-behind",
    category: "sprint",
    label: "Sprint behind pace",
    value: "WEB Sprint 12 at 41% with 5 days left",
    severity: "warning",
  },
  {
    id: "bug-backlog",
    category: "quality",
    label: "Bug backlog",
    value: "18 open bugs across portfolio",
    severity: "info",
  },
];

const MOCK_GAPS: JiraDeliveryGap[] = [
  {
    area: "Schedule",
    gap: "Fix version 2.4.0 is overdue with open scope",
    priority: "high",
  },
  {
    area: "Execution",
    gap: "WEB sprint completion below 50% mid-sprint",
    priority: "medium",
  },
  {
    area: "Quality",
    gap: "Bug count trending up vs prior sync",
    priority: "low",
  },
];

const TREND_BY_RANGE: Record<DeliveryAnalysisFilters["range"], DeliveryAnalysisTrendPoint[]> = {
  "7d": [
    { syncedAt: "2026-05-28T10:00:00Z", healthScore: 80, openWork: 136, blocked: 5, overdue: 9 },
    { syncedAt: "2026-05-30T10:00:00Z", healthScore: 79, openWork: 139, blocked: 6, overdue: 10 },
    { syncedAt: "2026-06-01T10:00:00Z", healthScore: 78, openWork: 142, blocked: 6, overdue: 11 },
  ],
  "30d": [
    { syncedAt: "2026-05-05T10:00:00Z", healthScore: 85, openWork: 118, blocked: 3, overdue: 6 },
    { syncedAt: "2026-05-12T10:00:00Z", healthScore: 83, openWork: 125, blocked: 4, overdue: 7 },
    { syncedAt: "2026-05-19T10:00:00Z", healthScore: 81, openWork: 131, blocked: 5, overdue: 8 },
    { syncedAt: "2026-05-26T10:00:00Z", healthScore: 79, openWork: 138, blocked: 5, overdue: 10 },
    { syncedAt: "2026-06-01T10:00:00Z", healthScore: 78, openWork: 142, blocked: 6, overdue: 11 },
  ],
  "90d": [
    { syncedAt: "2026-03-10T10:00:00Z", healthScore: 88, openWork: 95, blocked: 2, overdue: 4 },
    { syncedAt: "2026-04-07T10:00:00Z", healthScore: 86, openWork: 108, blocked: 3, overdue: 5 },
    { syncedAt: "2026-05-05T10:00:00Z", healthScore: 85, openWork: 118, blocked: 3, overdue: 6 },
    { syncedAt: "2026-05-19T10:00:00Z", healthScore: 81, openWork: 131, blocked: 5, overdue: 8 },
    { syncedAt: "2026-06-01T10:00:00Z", healthScore: 78, openWork: 142, blocked: 6, overdue: 11 },
  ],
};

export function getAvailableMockProjectKeys(): string[] {
  return MOCK_PROJECTS.map((p) => p.key);
}

export function getMockDeliveryAnalysisSnapshot(
  filters: DeliveryAnalysisFilters,
): DeliveryAnalysisSnapshot {
  const projects = filterSnapshotProjects(MOCK_PROJECTS, filters);
  const trend = TREND_BY_RANGE[filters.range];

  return computeDeliveryAnalysisSnapshot({
    projects,
    filters,
    siteUrl: MOCK_SITE_URL,
    generatedAt: "2026-06-01T10:00:00Z",
    signals: MOCK_SIGNALS,
    gaps: MOCK_GAPS,
    trend,
    kpisDeltas: {
      healthScoreDelta: -4,
      openWorkDelta: 8,
      blockedDelta: 0,
      overdueDelta: 3,
    },
  });
}
