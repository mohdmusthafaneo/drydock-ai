import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { isOpsQueueRecommendationTitle } from "@/lib/agent-analysis/ops-queue";
import {
  buildApprovalsHeroSummary,
  sortPendingApprovals,
} from "@/lib/governance/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecommendationApprovalCard } from "@/components/approvals/recommendation-approval-card";
import { RevealSection } from "@/components/motion/reveal-section";

function approvalTitle(approval: {
  title: string | null;
  recommendation: { title: string } | null;
}): string {
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

function isOpsApproval(approval: {
  title: string | null;
  recommendation: { title: string } | null;
}): boolean {
  return isOpsQueueRecommendationTitle(approvalTitle(approval));
}

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const undecided = ctx.approvals.filter((a) => !a.decision);
  const pending = sortPendingApprovals(undecided.filter((a) => !isOpsApproval(a)));
  const opsPending = sortPendingApprovals(undecided.filter(isOpsApproval));
  const decided = ctx.approvals.filter((a) => a.decision);
  const hero = buildApprovalsHeroSummary(ctx);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Approval center"
        description="Human-governed gate for recommendations. No deployment without approval."
      />

      <RevealSection className="rounded-[24px] border border-border-subtle bg-pure-white px-6 py-6 shadow-[var(--shadow)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
          Waiting on leadership
        </p>
        <h2 className="mt-2 font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
          {hero.headline}
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ash">{hero.subcopy}</p>
      </RevealSection>

      <Card>
        <CardHeader>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>
            {pending.length} leadership item{pending.length === 1 ? "" : "s"} awaiting
            decision
          </CardDescription>
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
                  Releases can proceed without your sign-off.
                  {opsPending.length > 0
                    ? " Engineering ops items are tracked under Recommendations."
                    : ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {pending.map((approval) => {
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
        </CardContent>
      </Card>

      {opsPending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Engineering ops queue</CardTitle>
            <CardDescription>
              {opsPending.length} cloud / board-health item
              {opsPending.length === 1 ? "" : "s"} — routed to eng leads via{" "}
              <Link href="/recommendations" className="underline-offset-4 hover:underline">
                Recommendations
              </Link>
              , not leadership release gates. Prefer resolving there; these will clear on
              the next agent sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {opsPending.slice(0, 8).map((approval) => (
              <div
                key={approval.id}
                className="rounded-xl border border-border-subtle bg-elevated px-4 py-3 text-sm"
              >
                <p className="font-medium text-primary">{approvalTitle(approval)}</p>
                <p className="mt-1 text-xs text-muted">
                  Ops queue · see Recommendations for action
                </p>
              </div>
            ))}
            {opsPending.length > 8 ? (
              <p className="text-xs text-muted">
                +{opsPending.length - 8} more — open Recommendations to review.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
