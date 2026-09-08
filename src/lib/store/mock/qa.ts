import type { AgentPageView } from "@/lib/agent-analysis/types";
import type { QaData } from "@/lib/store/types";

/** Demo QA board view aligned with Overview delivery pressure. */
const MOCK_QA_VIEW: AgentPageView = {
  hero: {
    verdict: "attention",
    verdictLabel: "Board pressure",
    headline: "31 blocked issues holding release confidence",
    subcopy:
      "22 open bugs across WEB, MOB, DATA, and INFRA. Clear blockers before the next ship window.",
  },
  highlights: [
    {
      id: "blocked",
      label: "Blocked",
      value: "31",
      subtext: "26% of open work",
      tone: "risk",
    },
    {
      id: "open-bugs",
      label: "Open bugs",
      value: "22",
      tone: "attention",
    },
    {
      id: "open",
      label: "Open issues",
      value: "117",
      tone: "neutral",
    },
  ],
  decisions: [
    {
      id: "clear-blockers",
      audience: "leadership",
      title: "Assign owners and ETAs for blocked work",
      detail: "31 blocked items lack a clear path — ask engineering for ownership before sprint end.",
      href: "/delivery-analysis?riskFocus=blockers",
      ctaLabel: "Open delivery analysis",
      tone: "attention",
    },
    {
      id: "triage-bugs",
      audience: "engineering",
      title: "Triage open bugs before the next release gate",
      detail: "22 open bugs remain in the evidence set — elevate ownership on WEB and MOB.",
      href: "/attention",
      ctaLabel: "Open attention queue",
      tone: "attention",
    },
  ],
  scope: "WEB, MOB, DATA, INFRA · Sprint 37 · demo evidence set",
};

export const mockQa: QaData = {
  view: MOCK_QA_VIEW,
  empty: false,
};
