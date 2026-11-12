import type { TimeRange } from "@/lib/delivery-analysis/types";

/** Status transition from Jira changelog (or synthesized for mocks). */
export type LifecycleTransition = {
  from?: string;
  to: string;
  at: string;
};

export type LifecycleStatusCategory =
  | "todo"
  | "inProgress"
  | "qa"
  | "done"
  | "blocked"
  | "other";

/** Single ticket with computed flow metrics. */
export type LifecycleIssue = {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategory: LifecycleStatusCategory;
  priority: string;
  projectKey: string;
  teamKey?: string;
  teamName?: string;
  assignee?: string;
  created: string;
  resolutionDate?: string;
  dueDate?: string;
  storyPoints?: number;
  transitions: LifecycleTransition[];
  /** Created → Done hours. Null when not resolved. */
  leadHours: number | null;
  /** First In Progress → Done hours. Null when missing transition or not done. */
  cycleHours: number | null;
  /** Age of open work (hours since created or last transition). */
  ageHours: number | null;
  /** Hours spent in each named status (from transitions). */
  timeInStatusHours: Record<string, number>;
  /** Why cycle/lead is missing — surfaced so nothing is silently suppressed. */
  metricGaps?: string[];
  /** Optional schedule-risk reason when issue is also at-risk evidence. */
  riskReason?: string;
  jiraUrl?: string;
};

export type LifecycleStageRow = {
  status: string;
  category: LifecycleStatusCategory;
  count: number;
  /** Median hours spent in this status across sampled issues. */
  medianHours: number | null;
};

export type LifecyclePersonRow = {
  assignee: string;
  openWip: number;
  staleCount: number;
  throughput: number;
  medianCycleHours: number | null;
  medianLeadHours: number | null;
  medianAgeHours: number | null;
};

export type LifecycleKpis = {
  medianCycleHours: number | null;
  medianLeadHours: number | null;
  throughput: number;
  currentWip: number;
  agingWipCount: number;
  agingWipPct: number | null;
  /** Days threshold used for aging WIP. */
  agingThresholdDays: number;
  sampleSize: number;
  sampleCapped: boolean;
  rangeLabel: string;
};

export type LifecycleSnapshot = {
  generatedAt: string;
  range: TimeRange;
  projectKey: string | null;
  siteUrl?: string;
  kpis: LifecycleKpis;
  stageRows: LifecycleStageRow[];
  issues: LifecycleIssue[];
  byPerson: LifecyclePersonRow[];
  /** True when transitions were synthesized (mock) or partially missing. */
  transitionsInferred?: boolean;
  source: "mock" | "jira_sample" | "unavailable";
  unavailableReason?: string;
};

/** Capped issue+changelog sample persisted on Integration metadata. */
export type LifecycleIssueSampleStored = {
  fetchedAt: string;
  projectKey: string;
  windowDays: number;
  capped: boolean;
  issues: Array<{
    key: string;
    summary?: string;
    issueType: string;
    status: string;
    priority?: string;
    created?: string;
    resolutionDate?: string;
    labels?: string[];
    assignee?: string;
    dueDate?: string;
    transitions: LifecycleTransition[];
  }>;
};
