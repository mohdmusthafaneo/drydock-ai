"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RecommendationApprovalCard } from "@/components/approvals/recommendation-approval-card";
import { DecisionHistoryList } from "@/components/approvals/decision-history-list";
import { RevealSection } from "@/components/motion/reveal-section";
import { useAppData } from "@/lib/store";

export function ApprovalsFromStore() {
  const approvals = useAppData((s) => s.data.approvals);
  const mode = useAppData((s) => s.data.meta.mode);
  const demoMode = mode !== "live";

  const historyItems = approvals.decisionHistory.map((item) => ({
    id: item.id,
    title: item.title,
    decision: item.decision,
    comment: null,
    decidedAt: item.decidedAt,
    approverName: item.decidedBy,
    release: null,
    isSystemEvent: false,
  }));

  return (
    <div className="space-y-[13px]">
      <PageHeader
        title="Approval center"
        description="Leadership decisions for the active release — demo data aligned with Overview."
      />

      <RevealSection className="rounded-[var(--radius-card)] border border-[#e2ebfa] bg-[#f2f7ff] px-[21px] py-[18px] shadow-[var(--shadow)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          Waiting on leadership
        </p>
        <h2 className="mt-1.5 text-[18px] font-semibold leading-[1.25] tracking-[-0.2px] text-ink">
          {approvals.hero.headline}
        </h2>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-secondary">
          {approvals.hero.subcopy}
        </p>
      </RevealSection>

      <Card>
        <CardHeader>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>
            {approvals.pending.length} leadership item
            {approvals.pending.length === 1 ? "" : "s"} awaiting decision
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-[13px]">
          <div className="space-y-4">
            {approvals.pending.map((item) => (
              <RecommendationApprovalCard
                key={item.approvalId}
                approvalId={item.approvalId}
                riskScore={item.riskScore}
                recommendation={item.recommendation}
                demoMode={demoMode}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision history</CardTitle>
          <CardDescription>Recent sign-off decisions for audit review</CardDescription>
        </CardHeader>
        <CardContent>
          <DecisionHistoryList items={historyItems} />
        </CardContent>
      </Card>
    </div>
  );
}
