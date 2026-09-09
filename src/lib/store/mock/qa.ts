import type { AgentPageView } from "@/lib/agent-analysis/types";
import type { QaData } from "@/lib/store/types";
import { MOCK_SUITE_HEALTH } from "@/lib/store/mock/qa-suite-health";

/** Demo QA view: automation suite health from the commerceflow-wdio audit. */
const MOCK_QA_VIEW: AgentPageView = {
  hero: {
    verdict: "attention",
    verdictLabel: "Needs attention",
    headline: "21 serious issues in the test suite",
    subcopy:
      "commerceflow-wdio has 1,097 scenarios across 3 suites. Oversized files, copied helpers, and shared globals make a green run harder to trust.",
  },
  highlights: [
    {
      id: "high-findings",
      label: "Serious issues",
      value: "21",
      subtext: "56 issues found in total",
      tone: "risk",
    },
    {
      id: "god-classes",
      label: "Oversized files",
      value: "9",
      subtext: "Largest is 10,073 lines",
      tone: "risk",
    },
    {
      id: "clones",
      label: "Copied across suites",
      value: "21",
      subtext: "Same helpers maintained 3 times",
      tone: "attention",
    },
    {
      id: "global-vars",
      label: "Shared global writes",
      value: "527",
      subtext: "Across 88 files",
      tone: "attention",
    },
  ],
  decisions: [
    {
      id: "hygiene-first",
      audience: "engineering",
      title: "Clean dead and duplicate steps before bigger refactors",
      detail:
        "443 commented-out lines and several duplicate step wordings are cheap to fix and reduce noise immediately.",
      href: "/qa#start-here",
      ctaLabel: "See small fixes",
      tone: "attention",
    },
    {
      id: "shared-support",
      audience: "engineering",
      title: "Keep one shared copy of support files",
      detail:
        "Sign-in and helpers are exact or near copies across suites. One shared package means a fix lands once.",
      href: "/qa#files",
      ctaLabel: "See files",
      tone: "attention",
    },
    {
      id: "kill-global-vars",
      audience: "engineering",
      title: "Stop passing data through a global variable",
      detail:
        "527 shared writes couple scenarios together and make parallel runs flaky. Use per-scenario context instead.",
      href: "/ledger",
      ctaLabel: "Open Tests",
      tone: "attention",
    },
  ],
  scope: `${MOCK_SUITE_HEALTH.repo} · ${MOCK_SUITE_HEALTH.framework} · ${MOCK_SUITE_HEALTH.totals.suites} suites · ${MOCK_SUITE_HEALTH.totals.scenarios.toLocaleString()} scenarios`,
};

export const mockQa: QaData = {
  view: MOCK_QA_VIEW,
  empty: false,
  suiteHealth: MOCK_SUITE_HEALTH,
};
