import type { AttentionData } from "@/lib/store/types";

export const mockAttention: AttentionData = {
  items: [
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
  ],
};
