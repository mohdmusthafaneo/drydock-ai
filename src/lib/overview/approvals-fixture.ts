import type { RecommendationApprovalData } from "@/components/approvals/recommendation-approval-card";

/** Demo leadership decision aligned with Overview fixture `leadership.count: 1`. */
export const OVERVIEW_APPROVALS_FIXTURE = {
  pending: [
    {
      approvalId: "fixture-approval-sprint-gate",
      riskScore: 0.62,
      recommendation: {
        title: "Approve Sprint 37 release gate despite blocked backlog",
        description:
          "31 blocked issues remain in the Sprint 37 evidence set. Leadership must decide whether to hold the release or accept spillover with an explicit owner and ETA.",
        rationale:
          "Delivery confidence is Caution (48). Overview surfaces 1 decision needed so Approvals is not empty while the demo fixture is on.",
        impact: "HIGH",
        confidence: 0.78,
        requiredRole: "DELIVERY_MANAGER",
        queue: "RELEASE_GATE" as const,
        affectedSystems: ["Connexus Web", "Mobile App"],
        createdAt: "2026-08-20T14:00:00.000Z",
        release: { id: "fixture-release-37", name: "Sprint 37 release" },
      } satisfies RecommendationApprovalData,
    },
  ],
  hero: {
    headline: "1 decision is waiting on leadership",
    subcopy:
      "Demo fixture: sign off on the Sprint 37 release gate, or reject it with a recorded reason. This mirrors the Overview “1 decision needed” claim.",
  },
};

export type AttentionQueueItem = {
  id: string;
  title: string;
  reason: string;
  originatingDecision: string;
  href: string;
  tone: "danger" | "warning" | "info";
};

/** Demo attention queue aligned with Overview fixture `attention.count: 2`. */
export const OVERVIEW_ATTENTION_FIXTURE: AttentionQueueItem[] = [
  {
    id: "att-blocked-owners",
    title: "30 blocked issues lack an owner and ETA",
    reason:
      "Evidence set still shows blocked work without an engineering owner. Overview asked for an owner and ETA before the sprint ends.",
    originatingDecision:
      "Surfaced from Overview attention banner — nothing was silently suppressed.",
    href: "/delivery-analysis?riskFocus=blockers",
    tone: "danger",
  },
  {
    id: "att-spillover",
    title: "16 items likely to spill out of Sprint 37",
    reason:
      "Schedule risk on the active sprint. Review the spillover list and decide what stays in scope.",
    originatingDecision:
      "Surfaced from Overview key takeaway “16 items at risk” / attention count.",
    href: "/delivery-analysis?riskFocus=schedule",
    tone: "warning",
  },
];
