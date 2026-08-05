import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import {
  buildReleasePortfolioHighlights,
  releaseListVerdict,
  releaseStatusLabel,
  sortReleasesByRisk,
} from "@/lib/governance/presentation";
import { verdictBadgeVariant, releaseStatusBadgeVariant } from "@/lib/release-gate-brief";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { RevealSection } from "@/components/motion/reveal-section";

export default async function ReleasesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const releases = sortReleasesByRisk(ctx.releases);
  const highlights = buildReleasePortfolioHighlights(ctx.releases);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Release governance"
        description="Portfolio verdict at a glance — then drill into each release gate."
      >
        <Button asChild variant="ink" size="lg">
          <Link href="/releases/new">+ Register release</Link>
        </Button>
      </PageHeader>

      {releases.length > 0 && (
        <RevealSection>
          <BriefingHighlights highlights={highlights} />
        </RevealSection>
      )}

      {releases.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-dove bg-sky-wash/40 px-6 py-12 text-center">
          <p className="text-ash">No releases yet. Register a release event to start the workflow.</p>
          <Button asChild variant="ink" size="lg" className="mt-4">
            <Link href="/releases/new">Register release</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {releases.map((r) => {
            const verdict = releaseListVerdict(r);
            const statusLabel = releaseStatusLabel(r.status);

            return (
              <Link
                key={r.id}
                href={`/releases/${r.id}`}
                className="block rounded-[var(--radius-card)] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-subtle)] transition-colors hover:bg-hover"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-medium text-ink">
                      {r.name}
                      {r.version ? ` · ${r.version}` : ""}
                    </p>
                    <p className="text-sm text-muted">
                      {r.environment}
                      {r.serviceScope ? ` · ${r.serviceScope}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {verdict && (
                      <Badge variant={verdictBadgeVariant(verdict)} className="px-2.5 py-1">
                        {verdict}
                      </Badge>
                    )}
                    <Badge variant={releaseStatusBadgeVariant(r.status)}>
                      {statusLabel}
                    </Badge>

                  </div>
                </div>
                {r.readinessScore != null && (
                  <p className="mt-2 text-sm text-ash">
                    QA readiness {Math.round(r.readinessScore)}% · governance risk{" "}
                    {r.governanceRiskScore != null ? Math.round(r.governanceRiskScore) : "—"}%
                    {r.jiraSprintId != null ? " · synced from Jira sprint" : ""}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
