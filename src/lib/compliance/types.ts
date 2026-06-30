export type ComplianceFindingSeverity = "critical" | "warning" | "info";

export type ComplianceFindingStatus = "open" | "resolved";

export type ComplianceEvalPhase = "sync" | "enrich" | "all";

export type ComplianceTargetType = "pull_request" | "commit" | "org";

export type ComplianceFindingCandidate = {
  ruleKey: string;
  dedupKey: string;
  severity: ComplianceFindingSeverity;
  targetType: ComplianceTargetType;
  targetExternalId: string;
  projectKey?: string | null;
  title: string;
  detail: Record<string, unknown>;
  entityLabel?: string;
  entityUrl?: string;
  repo?: string;
};

export type ComplianceFindingSummary = {
  openCount: number;
  criticalOpen: number;
  warningOpen: number;
  infoOpen: number;
  lastEvaluatedAt: string | null;
};

export type ComplianceFindingView = {
  id: string;
  ruleKey: string;
  severity: ComplianceFindingSeverity;
  status: ComplianceFindingStatus;
  targetType: ComplianceTargetType;
  targetExternalId: string;
  projectKey: string | null;
  title: string;
  detail: Record<string, unknown>;
  entityLabel: string | null;
  entityUrl: string | null;
  repo: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
};

export type EvaluateComplianceResult = {
  status: "evaluated" | "skipped";
  reason?: string;
  phase: ComplianceEvalPhase;
  triggered: number;
  created: number;
  updated: number;
  resolved: number;
  reopened: number;
};
