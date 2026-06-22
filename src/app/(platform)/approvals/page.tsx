import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { parseHirePayload } from "@/lib/agent-control-plane/hire";
import {
  buildApprovalsHeroSummary,
  sortPendingApprovals,
} from "@/lib/governance/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentHireApprovalCard } from "@/components/approvals/agent-hire-approval-card";
import { RecommendationApprovalCard } from "@/components/approvals/recommendation-approval-card";

function approvalTitle(approval: {
  type: string;
  title: string | null;
  recommendation: { title: string } | null;
}): string {
  if (approval.type === "AGENT_HIRE") {
    return approval.title ?? "Agent hire request";
  }
  return approval.recommendation?.title ?? approval.title ?? "Approval";
}

function formatDecidedAt(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const pending = sortPendingApprovals(ctx.approvals.filter((a) => !a.decision));
  const decided = ctx.approvals.filter((a) => a.decision);
  const hero = buildApprovalsHeroSummary(ctx);

  const releaseApprovals = pending.filter((a) => a.type !== "AGENT_HIRE");
  const agentHireApprovals = pending.filter((a) => a.type === "AGENT_HIRE");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Approval center"
        description="Human-governed gate for recommendations and agent hires. No deployment or agent activation without approval."
      />

      <section className="rounded-[24px] border border-border-subtle bg-pure-white px-6 py-6 shadow-[var(--shadow)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
          Waiting on leadership
        </p>
        <h2 className="mt-2 font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
          {hero.headline}
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ash">{hero.subcopy}</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>{pending.length} awaiting decision</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {pending.length === 0 ? (
            <div className="flex items-start gap-3 rounded-[24px] border border-border-subtle bg-fog/40 px-5 py-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-chart-blue" strokeWidth={1.5} />
              <div>
                <p className="font-display text-[17px] leading-snug text-ink">
                  No leadership actions right now
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-ash">
                  Releases can proceed without your sign-off, and no agent hires are waiting.
                </p>
              </div>
            </div>
          ) : (
            <>
              {releaseApprovals.length > 0 && (
                <div className="space-y-4">
                  {releaseApprovals.length > 0 && agentHireApprovals.length > 0 && (
                    <h3 className="text-[13px] font-medium uppercase tracking-[0.06em] text-graphite">
                      Release governance
                    </h3>
                  )}
                  {releaseApprovals.map((approval) => {
                    if (!approval.recommendation) {
                      return (
                        <p key={approval.id} className="text-sm text-error">
                          Missing recommendation data for approval
                        </p>
                      );
                    }

                    const rec = approval.recommendation;

                    return (
                      <RecommendationApprovalCard
                        key={approval.id}
                        approvalId={approval.id}
                        riskScore={approval.riskScore}
                        recommendation={{
                          title: rec.title,
                          description: rec.description,
                          rationale: rec.rationale,
                          impact: rec.impact,
                          confidence: rec.confidence,
                          requiredRole: rec.requiredRole,
                          release: rec.release
                            ? { id: rec.release.id, name: rec.release.name }
                            : null,
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {agentHireApprovals.length > 0 && (
                <div className="space-y-4">
                  {releaseApprovals.length > 0 && (
                    <h3 className="text-[13px] font-medium uppercase tracking-[0.06em] text-graphite">
                      Agent hires
                    </h3>
                  )}
                  {agentHireApprovals.map((approval) => {
                    const payload = parseHirePayload(approval.payloadJson);
                    if (!payload) {
                      return (
                        <p key={approval.id} className="text-sm text-error">
                          Invalid agent hire payload
                        </p>
                      );
                    }
                    return (
                      <AgentHireApprovalCard
                        key={approval.id}
                        approvalId={approval.id}
                        title={approvalTitle(approval)}
                        payload={payload}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision history</CardTitle>
          <CardDescription>Recent sign-off decisions for audit review</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {decided.length === 0 ? (
            <p className="text-sm text-muted">No decisions yet.</p>
          ) : (
            decided.map((approval) => {
              const releaseName = approval.recommendation?.release?.name;
              const decidedLabel = formatDecidedAt(approval.decidedAt);

              return (
                <div
                  key={approval.id}
                  className="rounded-xl border border-border-subtle bg-elevated px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {approval.type === "AGENT_HIRE" && (
                          <Badge variant="ai">Agent hire</Badge>
                        )}
                        <span className="font-medium text-primary">{approvalTitle(approval)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        {releaseName && approval.recommendation?.release && (
                          <Link
                            href={`/releases/${approval.recommendation.release.id}`}
                            className="text-ink underline-offset-4 hover:underline"
                          >
                            {releaseName}
                          </Link>
                        )}
                        {decidedLabel && <span>Decided {decidedLabel}</span>}
                        {approval.approver?.name && <span>By {approval.approver.name}</span>}
                      </div>
                      {approval.comment && (
                        <p className="text-xs text-secondary">&ldquo;{approval.comment}&rdquo;</p>
                      )}
                    </div>
                    <Badge variant={approval.decision === "APPROVED" ? "success" : "muted"}>
                      {approval.decision}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
