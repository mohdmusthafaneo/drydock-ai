import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { readJsonField } from "@/lib/json-field";
import { isLeadershipApprovalCenterItem } from "@/lib/recommendation-queue";
import {
  buildApprovalsHeroSummary,
  sortPendingApprovals,
} from "@/lib/governance/presentation";
import {
  approvalCenterDescription,
  classifyDecisionHistoryItem,
} from "@/lib/approvals/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RecommendationApprovalCard } from "@/components/approvals/recommendation-approval-card";
import { DecisionHistoryList } from "@/components/approvals/decision-history-list";
import { RevealSection } from "@/components/motion/reveal-section";
import { OVERVIEW_APPROVALS_FIXTURE } from "@/lib/overview/approvals-fixture";
import { shouldUseOverviewFixture } from "@/lib/overview/fixture";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function approvalTitle(approval: {
  title: string | null;
  recommendation: { title: string } | null;
}): string {
  return approval.recommendation?.title ?? approval.title ?? "Approval";
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const useFixture = shouldUseOverviewFixture(firstParam(sp.fixture));

  if (useFixture) {
    const fixture = OVERVIEW_APPROVALS_FIXTURE;
    return (
      <div className="space-y-8">
        <PageHeader
          title="Approval center"
          description="Leadership decisions for the active release — demo fixture aligned with Overview."
        />

        <RevealSection className="rounded-[24px] border border-border-subtle bg-pure-white px-6 py-6 shadow-[var(--shadow)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            Waiting on leadership
          </p>
          <h2 className="mt-2 font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
            {fixture.hero.headline}
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ash">
            {fixture.hero.subcopy}
          </p>
        </RevealSection>

        <Card>
          <CardHeader>
            <CardTitle>Pending approvals</CardTitle>
            <CardDescription>
              {fixture.pending.length} leadership item
              {fixture.pending.length === 1 ? "" : "s"} awaiting decision
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {fixture.pending.map((item) => (
                <RecommendationApprovalCard
                  key={item.approvalId}
                  approvalId={item.approvalId}
                  riskScore={item.riskScore}
                  recommendation={item.recommendation}
                  demoMode
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
            <DecisionHistoryList items={[]} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const ctx = await getOrganizationContext(session.organizationId);

  const pending = sortPendingApprovals(
    ctx.approvals.filter(isLeadershipApprovalCenterItem),
  );
  const decided = ctx.approvals
    .filter((a) => a.decision)
    .map((approval) => {
      const classification = classifyDecisionHistoryItem(approval);

      return {
        id: approval.id,
        title: approvalTitle(approval),
        decision: approval.decision!,
        comment: approval.comment,
        decidedAt: approval.decidedAt?.toISOString() ?? null,
        approverName: approval.approver?.name ?? null,
        release: approval.recommendation?.release
          ? {
              id: approval.recommendation.release.id,
              name: approval.recommendation.release.name,
            }
          : null,
        isSystemEvent: classification.isSystemEvent,
      };
    });
  const hero = buildApprovalsHeroSummary(ctx);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Approval center"
        description={approvalCenterDescription(ctx.stats)}
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
            {pending.length} leadership item{pending.length === 1 ? "" : "s"} awaiting decision
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
                const systems = readJsonField(rec.affectedSystems, []) as string[];

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
                      queue: rec.queue,
                      affectedSystems: systems,
                      createdAt: rec.createdAt.toISOString(),
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

      <Card>
        <CardHeader>
          <CardTitle>Decision history</CardTitle>
          <CardDescription>Recent sign-off decisions for audit review</CardDescription>
        </CardHeader>
        <CardContent>
          <DecisionHistoryList items={decided} />
        </CardContent>
      </Card>
    </div>
  );
}
