import type { RiskData } from "@/lib/store/types";

export const mockRisk: RiskData = {
  available: true,
  title: "Release risk",
  description:
    "Risk signals aligned with Overview attention for Sprint 27 — blocked backlog and spillover.",
  items: [
    {
      id: "risk-blocked",
      title: "Blocked backlog without owners",
      severity: "high",
      summary:
        "30 blocked issues lack an engineering owner and ETA. Matches Overview attention and the blocked key takeaway.",
      href: "/delivery-analysis?riskFocus=blockers",
    },
    {
      id: "risk-spillover",
      title: "Sprint spillover candidates",
      severity: "medium",
      summary:
        "52 items are likely to spill out of Sprint 27. Matches Overview schedule-risk attention.",
      href: "/delivery-analysis?riskFocus=schedule#schedule-risk",
    },
  ],
};
