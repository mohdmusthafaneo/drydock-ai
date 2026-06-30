import type {
  CalibrationIssueSample,
  CalibrationObservations,
  CalibrationSample,
} from "@/lib/jira-calibration/types";

const DONE_NAME_HINTS = [/done/i, /closed/i, /resolved/i, /complete/i, /released/i];
const BLOCKED_NAME_HINTS = [/block/i, /impediment/i, /waiting/i, /hold/i];
const RELEASE_LABEL_HINTS = [/release/i, /^v\d/i, /^r\d/i];

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

function transitionKey(from: string | undefined, to: string): string {
  return `${from ?? "(none)"}->${to}`;
}

function countTransitions(issues: CalibrationIssueSample[]): Array<{ from: string; to: string; count: number }> {
  const counts = new Map<string, { from: string; to: string; count: number }>();
  for (const issue of issues) {
    for (const t of issue.transitions) {
      const key = transitionKey(t.from, t.to);
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { from: t.from ?? "(none)", to: t.to, count: 1 });
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function countStatusUsage(issues: CalibrationIssueSample[]): Record<string, number> {
  const usage: Record<string, number> = {};
  for (const issue of issues) {
    usage[issue.status] = (usage[issue.status] ?? 0) + 1;
    for (const t of issue.transitions) {
      usage[t.to] = (usage[t.to] ?? 0) + 1;
    }
  }
  return usage;
}

function inferDoneStatusNames(
  issues: CalibrationIssueSample[],
  transitions: Array<{ from: string; to: string; count: number }>,
): string[] {
  const terminalScores = new Map<string, number>();

  for (const issue of issues) {
    if (issue.resolutionDate) {
      terminalScores.set(issue.status, (terminalScores.get(issue.status) ?? 0) + 3);
    }
    if (DONE_NAME_HINTS.some((re) => re.test(issue.status))) {
      terminalScores.set(issue.status, (terminalScores.get(issue.status) ?? 0) + 2);
    }
  }

  for (const t of transitions) {
    if (DONE_NAME_HINTS.some((re) => re.test(t.to))) {
      terminalScores.set(t.to, (terminalScores.get(t.to) ?? 0) + t.count);
    }
    const outbound = transitions.filter((x) => x.from === t.to).reduce((n, x) => n + x.count, 0);
    if (t.count >= 3 && outbound === 0) {
      terminalScores.set(t.to, (terminalScores.get(t.to) ?? 0) + t.count);
    }
  }

  const ranked = [...terminalScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .filter((name) => name !== "(none)");

  if (ranked.length > 0) return ranked.slice(0, 5);

  return ["Done", "Closed"];
}

function inferBlockedStatusName(
  transitions: Array<{ from: string; to: string; count: number }>,
  statusUsage: Record<string, number>,
): string {
  for (const t of transitions) {
    if (BLOCKED_NAME_HINTS.some((re) => re.test(t.to))) {
      return t.to;
    }
  }
  for (const name of Object.keys(statusUsage)) {
    if (BLOCKED_NAME_HINTS.some((re) => re.test(name))) return name;
  }
  return "Blocked";
}

function inferReleaseTracking(issues: CalibrationIssueSample[]): CalibrationObservations["releaseTrackingEvidence"] {
  const n = Math.max(issues.length, 1);
  const withFixVersion = issues.filter((i) => i.fixVersions.length > 0).length;
  const withReleaseLabel = issues.filter((i) =>
    i.labels.some((l) => RELEASE_LABEL_HINTS.some((re) => re.test(l))),
  ).length;

  const fixVersionUsageRate = withFixVersion / n;
  const labelReleaseUsageRate = withReleaseLabel / n;
  const sprintUsageRate = 0;

  let suggestedMode: CalibrationObservations["releaseTrackingEvidence"]["suggestedMode"] = "none";
  if (fixVersionUsageRate >= 0.15) suggestedMode = "fixVersion";
  else if (labelReleaseUsageRate >= 0.1) suggestedMode = "labels";

  return {
    fixVersionUsageRate,
    labelReleaseUsageRate,
    sprintUsageRate,
    suggestedMode,
  };
}

function inferHygieneBaselines(issues: CalibrationIssueSample[]): CalibrationObservations["hygieneBaselines"] {
  const openLike = issues.filter((i) => !i.resolutionDate);
  const now = Date.now();

  const unassignedFlags = openLike.map((i) => (i.assignee ? 0 : 1));
  const overdueFlags = openLike.map((i) => {
    if (!i.dueDate) return 0;
    return new Date(i.dueDate).getTime() < now ? 1 : 0;
  });

  return {
    unassignedRatioP50: percentile(unassignedFlags, 0.5),
    overdueRatioP50: percentile(overdueFlags, 0.5),
  };
}

function inferMethodology(sample: CalibrationSample): CalibrationObservations["methodology"] {
  const closedSprintSignal = (sample.aggregates.closedSprintCount ?? 0) > 0;
  const spilloverSignal = (sample.aggregates.spilloverCount ?? 0) > 0;
  if (closedSprintSignal || spilloverSignal) return "scrum";
  if (sample.issueCount >= 20) return "kanban";
  return "custom";
}

function inferConfidence(sample: CalibrationSample, transitions: Array<{ from: string; to: string; count: number }>): "high" | "medium" | "low" {
  if (sample.issueCount >= 100 && transitions.length >= 10) return "high";
  if (sample.issueCount >= 30 && transitions.length >= 3) return "medium";
  return "low";
}

/** Deterministic transition analysis from a calibration sample. */
export function analyzeCalibrationSample(sample: CalibrationSample): CalibrationObservations {
  const transitions = countTransitions(sample.issues);
  const statusUsage = countStatusUsage(sample.issues);
  const inferredDoneStatusNames = inferDoneStatusNames(sample.issues, transitions);
  const inferredBlockedStatusName = inferBlockedStatusName(transitions, statusUsage);
  const releaseTrackingEvidence = inferReleaseTracking(sample.issues);
  const methodology = inferMethodology(sample);

  const usesSprints =
    methodology === "scrum" ||
    (sample.aggregates.closedSprintCount ?? 0) > 0 ||
    (sample.aggregates.spilloverCount ?? 0) > 0;

  if (usesSprints && releaseTrackingEvidence.suggestedMode === "none") {
    releaseTrackingEvidence.suggestedMode = "sprint";
    releaseTrackingEvidence.sprintUsageRate =
      (sample.aggregates.closedSprintCount ?? 0) / Math.max(sample.issueCount, 1);
  }

  const spillover = sample.aggregates.spilloverCount ?? 0;
  const closedSprint = sample.aggregates.closedSprintCount ?? 0;
  const carryoverRate =
    closedSprint > 0 ? Math.min(1, spillover / closedSprint) : undefined;

  return {
    analyzedAt: new Date().toISOString(),
    windowDays: sample.windowDays,
    projectKey: sample.projectKey,
    statusUsage,
    transitions: transitions.slice(0, 50),
    inferredDoneStatusNames,
    inferredBlockedStatusName,
    releaseTrackingEvidence,
    sprintCadence: {
      usesSprints,
      carryoverRate,
    },
    hygieneBaselines: inferHygieneBaselines(sample.issues),
    methodology,
    confidence: inferConfidence(sample, transitions),
  };
}
