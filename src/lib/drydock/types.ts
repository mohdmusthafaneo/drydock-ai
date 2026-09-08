/**
 * DryDock test-trust view-model types and display helpers.
 * Mock payloads live in `src/lib/store/mock/*`.
 */

export type TrustDeficitReason =
  | "never_failed"
  | "flake"
  | "retry_masked"
  | "skipped"
  | "permafail"
  | "signal_decay"
  | "semantic_duplicate";

export type AttentionVerb = "rule" | "route" | "snooze" | "sign_off";

export type FindingSeverity = "high" | "medium" | "low";

export type MockTestCase = {
  id: string;
  name: string;
  suitePath: string;
  filePath: string;
  repository: string;
  category: "e2e" | "contract" | "smoke" | "unit";
  lastOutcome: "passed" | "failed" | "skipped";
  executionCount: number;
  failCount: number;
  retryPassCount: number;
  lastSeenAt: string;
  evidenceSummary: string;
};

export type MockTrustBucket = {
  reason: TrustDeficitReason;
  label: string;
  count: number;
  plainSentence: string;
  tests: MockTestCase[];
};

export type MockFinding = {
  id: string;
  verb: AttentionVerb;
  title: string;
  plainSentence: string;
  clusterSize: number;
  reason: TrustDeficitReason;
  severity: FindingSeverity;
  sourceChips: string[];
  estimatedMinutes: number;
  sinceLastRelease: boolean;
  inference: boolean;
  evidence: {
    repository: string;
    filePath: string;
    runSummary: string;
    errorText?: string;
  };
  tests: MockTestCase[];
};

export type MockLedger = {
  asOf: string;
  repositoriesAnalyzed: number;
  runsAnalyzed: number;
  totalTests: number;
  trustedCount: number;
  untrustedCount: number;
  sinceLastReleaseLabel: string;
  blindSpots: string[];
  buckets: MockTrustBucket[];
};

export type MockBriefing = {
  asOf: string;
  queueMinutes: number;
  silence: boolean;
  nextReleaseLabel: string;
  demotedCount: number;
  demotedSummary: string;
  findings: MockFinding[];
  ledger: MockLedger;
};

export const RULING_REASONS = [
  {
    code: "intentional_this_test",
    label: "Intentional for this specific test",
    scope: "This instance only",
  },
  {
    code: "correct_for_kind",
    label: "Correct for this kind of test",
    scope: "This kind of test",
  },
  {
    code: "required_by_integration",
    label: "Required by how we integrate with a dependency",
    scope: "Anything touching that dependency",
  },
  {
    code: "known_being_fixed",
    label: "Known, already being fixed",
    scope: "This instance, time-boxed",
  },
  {
    code: "accepted_risk",
    label: "Accepted risk for now",
    scope: "Expires at next release",
  },
  {
    code: "finding_wrong",
    label: "This issue is wrong",
    scope: "Report a DryDock mistake",
  },
] as const;

export function formatAsOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function verbLabel(verb: AttentionVerb): string {
  switch (verb) {
    case "rule":
      return "Decide";
    case "route":
      return "Send on";
    case "snooze":
      return "Remind later";
    case "sign_off":
      return "Accept";
  }
}
