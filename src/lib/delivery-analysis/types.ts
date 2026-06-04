import type { JiraDeliveryGap, JiraDeliverySignal } from "@/lib/jira-delivery-health";

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
  bugsOpen?: number;
  sprintCompletionPct?: number | null;
};

export type DeliveryAnalysisProjectRow = {
  key: string;
  name: string;
  healthScore: number;
  openIssues: number;
  blockedCount: number;
  overdueCount: number;
  bugsOpen: number;
  activeSprint?: {
    name: string;
    done: number;
    committed: number;
    pct: number;
  };
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
};

export const RISK_MIX_COLORS = {
  blocked: "var(--accent-error, #ef4444)",
  overdue: "var(--accent-warning, #f59e0b)",
  bugs: "var(--accent-mvp)",
  otherOpen: "var(--accent-enterprise, #4F8CFF)",
} as const;

export const RISK_MIX_LABELS = {
  blocked: "Blocked",
  overdue: "Overdue",
  bugs: "Open bugs",
  otherOpen: "Other open",
} as const;
