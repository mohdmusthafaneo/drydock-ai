export type PredictionSeverity = "critical" | "warning" | "info";

export type PredictionStatus = "open" | "resolved";

export type PredictionHorizon = "short" | "medium" | "long";

export type PredictionDomain =
  | "delivery"
  | "devops"
  | "compliance"
  | "planning"
  | "code";

export type PredictionCandidate = {
  key: string;
  domain: PredictionDomain;
  severity: PredictionSeverity;
  horizon: PredictionHorizon;
  confidence: number;
  rationale: string;
  signals: Record<string, unknown>;
  projectKey?: string | null;
};

export type PredictionSummary = {
  openCount: number;
  criticalOpen: number;
  warningOpen: number;
  infoOpen: number;
  lastEvaluatedAt: string | null;
};

export type PredictionView = {
  id: string;
  key: string;
  domain: PredictionDomain;
  severity: PredictionSeverity;
  horizon: PredictionHorizon;
  confidence: number;
  status: PredictionStatus;
  rationale: string;
  signals: Record<string, unknown>;
  projectKey: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
};

export type PersistPredictionsResult = {
  status: "evaluated" | "skipped";
  reason?: string;
  triggered: number;
  created: number;
  updated: number;
  resolved: number;
  reopened: number;
};
