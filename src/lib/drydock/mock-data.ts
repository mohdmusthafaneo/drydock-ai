/**
 * Mock Ledger + Briefing data for UI confirmation.
 * Swap consumers to real loaders after the architect signs off the surfaces.
 */

export type TrustDeficitReason =
  | "never_failed"
  | "flake"
  | "retry_masked"
  | "skipped"
  | "permafail"
  | "signal_decay";

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

const NEVER_FAILED_TESTS: MockTestCase[] = [
  {
    id: "tc-nf-1",
    name: "guest checkout completes with valid card",
    suitePath: "checkout › guest",
    filePath: "e2e/checkout/guest-checkout.spec.ts",
    repository: "storefront-web",
    category: "e2e",
    lastOutcome: "passed",
    executionCount: 412,
    failCount: 0,
    retryPassCount: 0,
    lastSeenAt: "2026-09-03T06:12:00Z",
    evidenceSummary:
      "412 consecutive passes. Covered path changed 18 times in 30 days. Inference: assertions may be vacuous.",
  },
  {
    id: "tc-nf-2",
    name: "promo code applies on cart page",
    suitePath: "cart › promotions",
    filePath: "e2e/cart/promo.spec.ts",
    repository: "storefront-web",
    category: "e2e",
    lastOutcome: "passed",
    executionCount: 388,
    failCount: 0,
    retryPassCount: 0,
    lastSeenAt: "2026-09-03T06:12:00Z",
    evidenceSummary:
      "388 consecutive passes while promo service had 6 production changes.",
  },
  {
    id: "tc-nf-3",
    name: "search returns products for common query",
    suitePath: "search › smoke",
    filePath: "e2e/search/basic.spec.ts",
    repository: "storefront-web",
    category: "smoke",
    lastOutcome: "passed",
    executionCount: 501,
    failCount: 0,
    retryPassCount: 0,
    lastSeenAt: "2026-09-03T05:40:00Z",
    evidenceSummary: "Never red across 501 runs. Search ranking code churned weekly.",
  },
];

const FLAKE_TESTS: MockTestCase[] = [
  {
    id: "tc-fl-1",
    name: "payment confirmation webhook acknowledged",
    suitePath: "payments › webhooks",
    filePath: "e2e/payments/webhook.spec.ts",
    repository: "payments-api",
    category: "e2e",
    lastOutcome: "passed",
    executionCount: 96,
    failCount: 14,
    retryPassCount: 9,
    lastSeenAt: "2026-09-02T22:10:00Z",
    evidenceSummary: "Same commit SHA produced pass and fail within 40 minutes, three times.",
  },
  {
    id: "tc-fl-2",
    name: "fulfil inventory updates after purchase",
    suitePath: "fulfil › inventory",
    filePath: "e2e/fulfil/inventory.spec.ts",
    repository: "fulfil-service",
    category: "e2e",
    lastOutcome: "failed",
    executionCount: 74,
    failCount: 11,
    retryPassCount: 6,
    lastSeenAt: "2026-09-02T21:55:00Z",
    evidenceSummary: "Divergent outcomes on commit a3f91c2 across two runners.",
  },
];

const RETRY_TESTS: MockTestCase[] = [
  {
    id: "tc-rt-1",
    name: "PDP image gallery loads within budget",
    suitePath: "pdp › media",
    filePath: "e2e/pdp/gallery.spec.ts",
    repository: "storefront-web",
    category: "e2e",
    lastOutcome: "passed",
    executionCount: 210,
    failCount: 0,
    retryPassCount: 47,
    lastSeenAt: "2026-09-03T04:01:00Z",
    evidenceSummary: "47 of last 60 green results required a second attempt.",
  },
];

const SKIPPED_TESTS: MockTestCase[] = [
  {
    id: "tc-sk-1",
    name: "express shipping ETA for rural postcodes",
    suitePath: "fulfil › shipping",
    filePath: "e2e/fulfil/express-eta.spec.ts",
    repository: "fulfil-service",
    category: "e2e",
    lastOutcome: "skipped",
    executionCount: 0,
    failCount: 0,
    retryPassCount: 0,
    lastSeenAt: "2026-08-12T11:00:00Z",
    evidenceSummary: "Skipped for 22 days. Quarantine tag added without a ticket link.",
  },
  {
    id: "tc-sk-2",
    name: "gift card balance after partial redeem",
    suitePath: "payments › gift-cards",
    filePath: "e2e/payments/gift-card.spec.ts",
    repository: "payments-api",
    category: "contract",
    lastOutcome: "skipped",
    executionCount: 0,
    failCount: 0,
    retryPassCount: 0,
    lastSeenAt: "2026-08-19T09:30:00Z",
    evidenceSummary: "Disabled count in payments suite rose from 3 → 11 since last release.",
  },
];

const PERMAFAIL_TESTS: MockTestCase[] = [
  {
    id: "tc-pf-1",
    name: "3DS challenge completes on Visa",
    suitePath: "payments › 3ds",
    filePath: "e2e/payments/3ds-visa.spec.ts",
    repository: "payments-api",
    category: "e2e",
    lastOutcome: "failed",
    executionCount: 64,
    failCount: 64,
    retryPassCount: 0,
    lastSeenAt: "2026-09-03T03:20:00Z",
    evidenceSummary: "Red for 19 consecutive days. Pipeline still green via allow-failure.",
  },
];

const DECAY_TESTS: MockTestCase[] = [
  {
    id: "tc-sd-1",
    name: "order history pagination",
    suitePath: "account › orders",
    filePath: "e2e/account/orders.spec.ts",
    repository: "storefront-web",
    category: "e2e",
    lastOutcome: "passed",
    executionCount: 180,
    failCount: 2,
    retryPassCount: 2,
    lastSeenAt: "2026-09-01T16:00:00Z",
    evidenceSummary:
      "Only failures in 90 days were flakes. No confirmed regression caught.",
  },
];

export const MOCK_LEDGER: MockLedger = {
  asOf: "2026-09-03T07:00:00Z",
  repositoriesAnalyzed: 3,
  runsAnalyzed: 412,
  totalTests: 1247,
  trustedCount: 891,
  untrustedCount: 356,
  sinceLastReleaseLabel: "since release 2026.08.28",
  blindSpots: [
    "Allure JSON absent for fulfilment-service",
    "Retry metadata missing on 2 workflows",
  ],
  buckets: [
    {
      reason: "never_failed",
      label: "Never failed",
      count: 184,
      plainSentence:
        "184 tests have never been red while their covered paths keep changing.",
      tests: NEVER_FAILED_TESTS,
    },
    {
      reason: "flake",
      label: "Flake contamination",
      count: 61,
      plainSentence: "61 tests produced different outcomes on the same commit.",
      tests: FLAKE_TESTS,
    },
    {
      reason: "retry_masked",
      label: "Retry-masked",
      count: 43,
      plainSentence: "43 tests only pass on a second attempt — green while lying.",
      tests: RETRY_TESTS,
    },
    {
      reason: "skipped",
      label: "Skipped / quarantined",
      count: 38,
      plainSentence: "38 tests are skipped or quarantined; the disabled count is rising.",
      tests: SKIPPED_TESTS,
    },
    {
      reason: "permafail",
      label: "Permafail",
      count: 12,
      plainSentence: "12 tests have been red beyond the threshold and are being routed around.",
      tests: PERMAFAIL_TESTS,
    },
    {
      reason: "signal_decay",
      label: "Signal decay",
      count: 18,
      plainSentence:
        "18 suites have not caught a confirmed regression recently despite running green.",
      tests: DECAY_TESTS,
    },
  ],
};

export const MOCK_BRIEFING: MockBriefing = {
  asOf: "2026-09-03T07:00:00Z",
  queueMinutes: 20,
  silence: false,
  nextReleaseLabel: "in four days",
  demotedCount: 14,
  demotedSummary: "14 items look covered by earlier rulings",
  ledger: MOCK_LEDGER,
  findings: [
    {
      id: "f-1",
      verb: "rule",
      title: "Never-failed cluster on guest checkout",
      plainSentence:
        "Three guest-checkout tests have never failed while checkout code changed 18 times this month.",
      clusterSize: 3,
      reason: "never_failed",
      severity: "high",
      sourceChips: ["storefront-web", "CI results", "Inference"],
      estimatedMinutes: 6,
      sinceLastRelease: true,
      inference: true,
      evidence: {
        repository: "storefront-web",
        filePath: "e2e/checkout/guest-checkout.spec.ts",
        runSummary: "412 consecutive passes on main",
      },
      tests: NEVER_FAILED_TESTS,
    },
    {
      id: "f-2",
      verb: "route",
      title: "Payment webhook flake on same commit",
      plainSentence:
        "payment confirmation webhook acknowledged passed and failed on commit a3f91c2 within 40 minutes.",
      clusterSize: 2,
      reason: "flake",
      severity: "high",
      sourceChips: ["payments-api", "CI results"],
      estimatedMinutes: 5,
      sinceLastRelease: true,
      inference: false,
      evidence: {
        repository: "payments-api",
        filePath: "e2e/payments/webhook.spec.ts",
        runSummary: "Divergent outcomes on a3f91c2",
        errorText: "TimeoutError: waiting for response to /webhooks/payment exceeded 15000ms",
      },
      tests: FLAKE_TESTS,
    },
    {
      id: "f-3",
      verb: "snooze",
      title: "Retry-masked gallery timing",
      plainSentence:
        "PDP image gallery loads within budget only passed after retry in 47 of the last 60 green runs.",
      clusterSize: 1,
      reason: "retry_masked",
      severity: "medium",
      sourceChips: ["storefront-web", "CI results"],
      estimatedMinutes: 4,
      sinceLastRelease: true,
      inference: false,
      evidence: {
        repository: "storefront-web",
        filePath: "e2e/pdp/gallery.spec.ts",
        runSummary: "First attempt fail → retry pass pattern",
      },
      tests: RETRY_TESTS,
    },
    {
      id: "f-4",
      verb: "rule",
      title: "Quarantine creep in payments",
      plainSentence:
        "Disabled count in the payments suite rose from 3 to 11 since the last release.",
      clusterSize: 2,
      reason: "skipped",
      severity: "medium",
      sourceChips: ["payments-api", "Delta"],
      estimatedMinutes: 3,
      sinceLastRelease: true,
      inference: false,
      evidence: {
        repository: "payments-api",
        filePath: "e2e/payments/gift-card.spec.ts",
        runSummary: "+8 skipped since 2026.08.28",
      },
      tests: SKIPPED_TESTS,
    },
    {
      id: "f-5",
      verb: "sign_off",
      title: "3DS permafail still allowed",
      plainSentence:
        "3DS challenge completes on Visa has been red for 19 days while the workflow remains green via allow-failure.",
      clusterSize: 1,
      reason: "permafail",
      severity: "high",
      sourceChips: ["payments-api", "CI results"],
      estimatedMinutes: 2,
      sinceLastRelease: false,
      inference: false,
      evidence: {
        repository: "payments-api",
        filePath: "e2e/payments/3ds-visa.spec.ts",
        runSummary: "64 consecutive failures",
        errorText: "expect(received).toBe(expected) // challenge frame never attached",
      },
      tests: PERMAFAIL_TESTS,
    },
  ],
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
    scope: "Test category",
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
    label: "This finding is wrong",
    scope: "Defect report — not a ruling",
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
      return "Rule";
    case "route":
      return "Route";
    case "snooze":
      return "Snooze";
    case "sign_off":
      return "Sign off";
  }
}
