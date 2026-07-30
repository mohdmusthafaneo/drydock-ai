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

export default async function RecommendationsCenterPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const highlights = buildRecommendationsSummaryHighlights(ctx);
  // Actionable queue only — rejected setup / collapsed qa-blocked stay in history via status filter.
  const active = ctx.recommendations.filter((r) => r.status !== "REJECTED");
  const sorted = sortRecommendationsByUrgency(active);

  const pendingApprovalByRecId = new Map(
    ctx.approvals
      .filter((a) => !a.decision && a.recommendationId)
      .map((a) => [a.recommendationId!, a.id]),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Recommendations center"
        description="Explainable AI proposals — scored, correlated, and routed to human governance."
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
        {sorted.length === 0 ? (
          <Card className="border-dashed border-border">
            <CardContent className="space-y-4 py-12 text-center">
              <p className="font-display text-[22px] leading-snug text-ink">
                No recommendations yet
              </p>
              <p className="mx-auto max-w-md text-[14px] leading-relaxed text-ash">
                Assess a release to generate governance recommendations. AIDOS will surface risks,
                gaps, and sign-off requirements before deploy.
              </p>
              <Button asChild variant="ink">
                <Link href="/releases">View releases</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          sorted.map((rec) => {
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
          })
        )}
      </div>
    </div>
  );
}
