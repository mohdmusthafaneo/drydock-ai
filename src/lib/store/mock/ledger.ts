import type { LedgerData } from "@/lib/store/types";
import type { MockTestCase } from "@/lib/drydock/types";

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
      "412 consecutive passes. Covered path changed 18 times in 30 days. Educated guess: assertions may not check anything real.",
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
    evidenceSummary:
      "Red for 19 consecutive days. Pipeline stays green because the step is marked allowed to fail.",
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

/** Shared sample tests referenced by briefing findings. */
export const mockLedgerSampleTests = {
  neverFailed: NEVER_FAILED_TESTS,
  flake: FLAKE_TESTS,
  retry: RETRY_TESTS,
  skipped: SKIPPED_TESTS,
  permafail: PERMAFAIL_TESTS,
  decay: DECAY_TESTS,
};

export const mockLedger: LedgerData = {
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
      label: "Always green (never been red)",
      count: 184,
      plainSentence:
        "184 tests have never been red while their covered paths keep changing.",
      tests: NEVER_FAILED_TESTS,
    },
    {
      reason: "flake",
      label: "Unstable on the same commit",
      count: 61,
      plainSentence: "61 tests produced different outcomes on the same commit.",
      tests: FLAKE_TESTS,
    },
    {
      reason: "retry_masked",
      label: "Only passes on retry",
      count: 43,
      plainSentence:
        "43 tests only pass on a second attempt — the pipeline stays green even though the first run failed.",
      tests: RETRY_TESTS,
    },
    {
      reason: "skipped",
      label: "Skipped or disabled",
      count: 38,
      plainSentence: "38 tests are skipped or disabled; the disabled count is rising.",
      tests: SKIPPED_TESTS,
    },
    {
      reason: "permafail",
      label: "Always failing",
      count: 12,
      plainSentence:
        "12 tests have been failing for a long time and are being worked around.",
      tests: PERMAFAIL_TESTS,
    },
    {
      reason: "signal_decay",
      label: "Hasn’t caught a real bug lately",
      count: 18,
      plainSentence:
        "18 suites have not caught a confirmed regression recently despite running green.",
      tests: DECAY_TESTS,
    },
  ],
};
