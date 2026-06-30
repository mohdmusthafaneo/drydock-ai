/** Aggregate-only calibration types — no raw issue persistence. */

export type StatusTransition = {
  from?: string;
  to: string;
  at: string;
};

export type CalibrationIssueSample = {
  key: string;
  status: string;
  issueType: string;
  created?: string;
  resolutionDate?: string;
  labels: string[];
  fixVersions: string[];
  assignee?: string;
  dueDate?: string;
  transitions: StatusTransition[];
};

export type CalibrationSample = {
  projectKey: string;
  windowDays: number;
  fetchedAt: string;
  issueCount: number;
  capped: boolean;
  issues: CalibrationIssueSample[];
  aggregates: {
    totalInWindow?: number;
    spilloverCount?: number;
    closedSprintCount?: number;
  };
};

export type CalibrationObservations = {
  analyzedAt: string;
  windowDays: number;
  projectKey: string;
  statusUsage: Record<string, number>;
  transitions: Array<{ from: string; to: string; count: number }>;
  inferredDoneStatusNames: string[];
  inferredBlockedStatusName: string;
  releaseTrackingEvidence: {
    fixVersionUsageRate: number;
    labelReleaseUsageRate: number;
    sprintUsageRate: number;
    suggestedMode: "fixVersion" | "sprint" | "labels" | "none";
  };
  sprintCadence?: {
    usesSprints: boolean;
    carryoverRate?: number;
  };
  hygieneBaselines: {
    unassignedRatioP50: number;
    overdueRatioP50: number;
    missingEstimateRatioP50?: number;
  };
  methodology: "scrum" | "kanban" | "mixed" | "custom";
  confidence: "high" | "medium" | "low";
};

export type CalibratedWorkflowProfile = {
  methodology: "scrum" | "kanban" | "mixed" | "custom";
  usesSprints: boolean;
  releaseTracking: "fixVersion" | "sprint" | "labels" | "none";
  blockedStatusName: string;
  doneStatusNames: string[];
  doneStatusCategory: "Done" | "Complete" | "Closed";
  bugIssueType?: string;
  hygieneBaselines: CalibrationObservations["hygieneBaselines"];
  rationale?: string;
  confidence: "high" | "medium" | "low";
};

export type JiraCalibrationStatus =
  | "pending"
  | "calibrating"
  | "calibrated"
  | "needs_review"
  | "failed";

export type JiraCalibrationProfileRow = {
  projectKey: string;
  status: JiraCalibrationStatus;
  windowDays: number;
  confidence: string | null;
  source: string;
  calibratedAt: string | null;
  observedJson: string;
  profileJson: string;
  llmRationale: string | null;
};

export function parseCalibrationObservations(json: string): CalibrationObservations | null {
  try {
    const parsed = JSON.parse(json) as CalibrationObservations;
    return parsed?.analyzedAt ? parsed : null;
  } catch {
    return null;
  }
}

export function parseCalibratedWorkflowProfile(json: string): CalibratedWorkflowProfile | null {
  try {
    const parsed = JSON.parse(json) as CalibratedWorkflowProfile;
    return parsed?.doneStatusNames ? parsed : null;
  } catch {
    return null;
  }
}
