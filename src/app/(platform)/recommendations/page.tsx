import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { readJsonField } from "@/lib/json-field";
import {
  buildRecommendationsSummaryHighlights,
  sortRecommendationsByUrgency,
} from "@/lib/governance/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { RevealSection } from "@/components/motion/reveal-section";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecommendationCard } from "@/components/recommendations/recommendation-card";

function renderRecommendationList(
  items: Awaited<ReturnType<typeof getOrganizationContext>>["recommendations"],
  pendingApprovalByRecId: Map<string, string>,
) {
  return items.map((rec) => {
    const systems = readJsonField(rec.affectedSystems, []) as string[];
    return (
      <RecommendationCard
        key={rec.id}
        rec={{
          id: rec.id,
          title: rec.title,
          description: rec.description,
          rationale: rec.rationale,
          impact: rec.impact,
          confidence: rec.confidence,
          status: rec.status,
          requiredRole: rec.requiredRole,
          affectedSystems: systems,
          release: rec.release ? { id: rec.release.id, name: rec.release.name } : null,
          pendingApprovalId: pendingApprovalByRecId.get(rec.id) ?? null,
        }}
      />
    );
  });
}

export default async function RecommendationsCenterPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const highlights = buildRecommendationsSummaryHighlights(ctx);
  const active = ctx.recommendations.filter((r) => r.status !== "REJECTED");
  const opsQueue = sortRecommendationsByUrgency(active.filter((r) => r.queue === "OPS"));
  const governanceQueue = sortRecommendationsByUrgency(
    active.filter((r) => r.queue === "GOVERNANCE"),
  );

  const pendingApprovalByRecId = new Map(
    ctx.approvals
      .filter((a) => !a.decision && a.recommendationId)
      .map((a) => [a.recommendationId!, a.id]),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Recommendations"
        description="OPS triage — engineering actions from agent analysis. Governance items that need leadership sign-off promote to Approval Center."
      />

      {highlights.length > 0 && (
        <RevealSection className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            At a glance
          </p>
          <BriefingHighlights highlights={highlights} />
        </RevealSection>
      )}

      <div className="space-y-4">
        <div>
          <h2 className="font-display text-[22px] leading-snug tracking-[-0.14px] text-ink">
            OPS queue
          </h2>
          <p className="mt-1 text-[14px] text-ash">
            Actionable engineering recommendations — work these without a leadership gate.
          </p>
        </div>

        {opsQueue.length === 0 ? (
          <Card className="border-dashed border-border">
            <CardContent className="space-y-4 py-12 text-center">
              <p className="font-display text-[22px] leading-snug text-ink">
                No OPS recommendations
              </p>
              <p className="mx-auto max-w-md text-[14px] leading-relaxed text-ash">
                Agent analysis will surface blocked work, cloud hygiene, and delivery risks here.
                Assess a release or refresh agents to populate the queue.
              </p>
              <Button asChild variant="ink">
                <Link href="/releases">View releases</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          renderRecommendationList(opsQueue, pendingApprovalByRecId)
        )}
      </div>

      {governanceQueue.length > 0 && (
        <div className="space-y-4 border-t border-border-subtle pt-8">
          <div>
            <h2 className="font-display text-[22px] leading-snug tracking-[-0.14px] text-ink">
              Governance
            </h2>
            <p className="mt-1 text-[14px] text-ash">
              Policy and autonomy changes — decide in{" "}
              <Link href="/approvals" className="font-medium text-ink underline-offset-4 hover:underline">
                Approval Center
              </Link>
              .
            </p>
          </div>
          {renderRecommendationList(governanceQueue, pendingApprovalByRecId)}
        </div>
      )}
    </div>
  );
}
