import type { SuiteHealthSnapshot } from "@/lib/qa/suite-health";

/**
 * Curated from AUTOMATION_QA_REPORT_DEMO (commerceflow-wdio, 2026-09-09).
 * Omits score-sheet rows, Jaccard matrices, and full timeout inventories —
 * those belong in a drill-down, not the architect attention surface.
 */
export const MOCK_SUITE_HEALTH: SuiteHealthSnapshot = {
  repo: "commerceflow-wdio",
  framework: "WebdriverIO + Cucumber",
  analyzedAt: "2026-09-09T12:00:00.000Z",
  healthScore: 44.55,
  riskBand: "medium",
  totals: {
    suites: 3,
    features: 211,
    scenarios: 1_097,
    findings: 56,
    high: 21,
    warning: 30,
    medium: 5,
  },
  drivers: [
    {
      id: "god-classes",
      severity: "high",
      title: "Some files are too large to review safely",
      summary:
        "Nine files are over 1,000 lines. Account data and page objects are hard to change without breaking unrelated checks.",
      evidence: "authFixtures.ts · 10,073 lines · siteConfigData.ts · 8,032 lines",
    },
    {
      id: "cross-suite-clones",
      severity: "high",
      title: "The same helpers were copied into every suite",
      summary:
        "Support and page files were pasted across e2e-core, e2e-lite, and e2e-mobile. A fix in one suite often never reaches the others.",
      evidence: "21 files · 73%–100% similar across suites",
    },
    {
      id: "config-drift",
      severity: "high",
      title: "Three runner configs are nearly the same file",
      summary:
        "Each suite has its own wdio.conf.ts. Shared setup should live in one place; suites should only name which specs they run.",
      evidence: "98.8%–99.3% similar across the three configs",
    },
    {
      id: "global-state",
      severity: "high",
      title: "Steps share data through a global variable",
      summary:
        "Tests write into a shared global bag between steps. That couples scenarios together and makes parallel runs unreliable.",
      evidence: "527 writes across 88 files",
    },
    {
      id: "hardcoded-fixtures",
      severity: "warning",
      title: "Emails and part numbers are hardcoded",
      summary:
        "Real-looking emails, SKUs, and postal codes sit inside steps and page objects. Catalog or environment changes break them quietly.",
      evidence: "2,269 emails · 919 part numbers · 138 postal codes",
    },
    {
      id: "magic-timeouts",
      severity: "warning",
      title: "Many waits are longer than a minute",
      summary:
        "Long fixed waits often hide slow screens or race conditions instead of waiting for a real ready condition.",
      evidence: "22 places over 60s · step timeout is 4 minutes in all three suites",
    },
  ],
  topFiles: [
    {
      id: "auth-fixtures",
      severity: "high",
      path: "e2e-core/support/data/authFixtures.ts",
      detail: "Huge hardcoded user list. Move accounts into env-based data or JSON.",
      metric: "10,073 lines",
    },
    {
      id: "site-config",
      severity: "high",
      path: "e2e-core/support/data/siteConfigData.ts",
      detail: "All domain config in one file. Split by domain.",
      metric: "8,032 lines",
    },
    {
      id: "pdp",
      severity: "high",
      path: "e2e-core/pageobjects/productDetailPage.ts",
      detail: "One page object covers product info, pricing, buy box, quick order, and reviews.",
      metric: "3,323 lines",
    },
    {
      id: "shared-helpers-clone",
      severity: "high",
      path: "support/sharedHelpers.ts",
      detail: "Almost the same helper file in every suite (95%–97% similar).",
      metric: "Copied 3×",
    },
    {
      id: "login-identical",
      severity: "high",
      path: "pageobjects/loginPage.ts ↔ signInPage.ts",
      detail: "Sign-in page object is an exact copy across suites.",
      metric: "Exact copy",
    },
    {
      id: "dup-steps",
      severity: "high",
      path: "e2e-core/step-definitions/subscriptionOrders.steps.ts",
      detail: "Vague steps like “the user clicks on …” are registered more than once.",
      metric: "Multiple dupes",
    },
  ],
  quickWins: [
    {
      id: "commented-steps",
      title: "Delete 443 commented-out step lines",
      detail: "Dead code in 62 files, mostly order and integration flows.",
    },
    {
      id: "dup-signatures",
      title: "Merge duplicate step wording",
      detail: "Start with subscriptionOrders.steps.ts and the duplicated product-list step in e2e-lite.",
    },
    {
      id: "shared-wdio-base",
      title: "Create one shared runner base config",
      detail: "Suite configs should only set spec paths and suite-specific overrides.",
    },
    {
      id: "generate-report-script",
      title: "Fix the generate-report script path",
      detail: "package.json points at a .js file; only the .ts file exists.",
    },
  ],
  cleanSignals: [
    "No TypeScript ignore comments",
    "Runner configs are all present",
    "Only one broken npm script path (generate-report)",
  ],
};
