import type { ApprovalsData } from "@/lib/store/types";
import type { RecommendationApprovalData } from "@/components/approvals/recommendation-approval-card";

const pendingRecommendation = {
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
} satisfies RecommendationApprovalData;

export const mockApprovals: ApprovalsData = {
  pending: [
    {
      approvalId: "fixture-approval-sprint-gate",
      riskScore: 0.62,
      recommendation: pendingRecommendation,
    },
  ],
  hero: {
    headline: "1 decision is waiting on leadership",
    subcopy:
      "Demo fixture: sign off on the Sprint 37 release gate, or reject it with a recorded reason. This mirrors the Overview “1 decision needed” claim.",
  },
  decisionHistory: [],
};
