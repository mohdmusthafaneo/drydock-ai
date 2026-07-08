import type { JiraDeliveryGap, JiraDeliverySignal } from "@/lib/jira-delivery-health";
import type { JiraHygieneFinding, JiraHygieneResult } from "@/lib/jira-hygiene";
import type { JiraStatusBreakdown } from "@/lib/jira-meta";

export type TimeRange = "7d" | "30d" | "90d";

export type RiskFocus = "all" | "blockers" | "schedule" | "quality" | "sprint";

export type CompareMode = "previous_sync" | "baseline";

export type DeliveryAnalysisFilters = {
  projectKey: string | null;
  riskFocus: RiskFocus;
  range: TimeRange;
  compare: CompareMode;
};

export type DeliveryAnalysisKpis = {
  healthScore: number;
  healthScoreDelta?: number;
  openWork: number;
  openWorkDelta?: number;
  blocked: number;
  blockedDelta?: number;
  overdue: number;
  overdueDelta?: number;
  reopened?: number;
  reopenedDelta?: number;
  spillover?: number;
  spilloverDelta?: number;
  bugsOpen?: number;
  sprintCompletionPct?: number | null;
  /** Open sprint issues in QA pipeline statuses (P2.3). */
  qaPipeline?: number;
  qaPipelineDelta?: number;
  /** Sum of resolved issues in the last 7 days across scope (P2b). */
  resolvedLast7d?: number;
  /** True when Jira is connected but 90-day calibration has not finished. */
  calibrationPending?: boolean;
  calibrationMessage?: string;
  jiraLinks?: { openWork?: string; blocked?: string; overdue?: string };
  /** Human label for active release scope (e.g. "Sprint 35"). */
  scopeLabel?: string;
  /** Release methodology scope mode when KPIs are release-scoped. */
  scopeMode?: "sprint" | "fixVersion";
};

export type DeliveryAnalysisProjectRow = {
  key: string;
  name: string;
  healthScore: number;
  openIssues: number;
  blockedCount: number;
  overdueCount: number;
  reopenedCount?: number;
  spilloverCount?: number;
  bugsOpen: number;
  resolvedLast7d?: number;
  statusBreakdown?: JiraStatusBreakdown;
  qaPipelineCount?: number;
  assigneeWorkload?: Array<{ assignee: string; openCount: number }>;
  activeSprint?: {
    name: string;
    done: number;
    committed: number;
    pct: number;
    storyPoints?: { committed: number; done: number; unestimatedIssues: number };
  };
  hygiene?: JiraHygieneResult;
};

export type DeliveryAnalysisVersionRow = {
  projectKey: string;
  projectName: string;
  id: string;
  name: string;
  released: boolean;
  releaseDate?: string;
  overdue?: boolean;
  openIssuesInVersion?: number;
  jiraUrl?: string;
};

export type DeliveryAnalysisSprintRow = {
  projectKey: string;
  projectName: string;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  done: number;
  committed: number;
  pct: number;
  severity?: "info" | "warning" | "critical";
  sprintId?: number;
  jiraUrl?: string;
  storyPoints?: { committed: number; done: number; unestimatedIssues: number };
  daysOverdue?: number;
  statusByName?: Record<string, number>;
  qaPipelineCount?: number;
};

export type DeliveryAnalysisTrendPoint = {
  syncedAt: string;
  healthScore: number;
  openWork: number;
  blocked?: number;
  overdue?: number;
};

export type DeliveryAnalysisSnapshot = {
  generatedAt: string;
  projectKeys: string[];
  siteUrl?: string;
  rangeLabel: string;
  kpis: DeliveryAnalysisKpis;
  riskMix: {
    blocked: number;
    overdue: number;
    bugs: number;
    otherOpen: number;
  };
  trend: DeliveryAnalysisTrendPoint[];
  byProject: DeliveryAnalysisProjectRow[];
  versions: DeliveryAnalysisVersionRow[];
  sprints: DeliveryAnalysisSprintRow[];
  signals: JiraDeliverySignal[];
  gaps: JiraDeliveryGap[];
  jiraHygiene?: {
    score: number;
    degradesTrust: boolean;
    worstProject?: { key: string; name: string };
    findings: JiraHygieneFinding[];
  };
  /** Active release scope label when KPIs are methodology-scoped. */
  scopeLabel?: string;
  scopeMode?: "sprint" | "fixVersion";
};

export const RISK_MIX_COLORS = {
  blocked: "var(--color-rust)",
  overdue: "color-mix(in srgb, var(--color-rust) 70%, white)",
  bugs: "var(--color-chart-blue)",
  otherOpen: "color-mix(in srgb, var(--color-chart-blue) 70%, white)",
} as const;

export const RISK_MIX_LABELS = {
  blocked: "Blocked",
  overdue: "Overdue",
  bugs: "Open bugs",
  otherOpen: "Other open",
} as const;
