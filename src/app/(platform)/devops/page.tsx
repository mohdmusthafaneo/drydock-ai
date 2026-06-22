import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import {
  buildDeploymentHealthHighlights,
  buildDeploymentHealthSummary,
} from "@/lib/governance/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VERDICT_BADGE = {
  good: "border-dove/50 bg-fog text-ash",
  attention: "border-apricot/40 bg-apricot-wash/60 text-rust",
  risk: "border-rust/25 bg-rust/8 text-rust",
  neutral: "border-dove/50 bg-fog text-graphite",
} as const;

export default async function DevOpsIntelligencePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const health = buildDeploymentHealthSummary(ctx);
  const highlights = buildDeploymentHealthHighlights(ctx);
  const devopsAgent = ctx.agents.find((a) => a.agentType === "DEVOPS_INTELLIGENCE");
  const rollbacks = ctx.deploymentEvents.filter((d) => d.rollbackRecommended);

  return (
    <div className="space-y-8">
      <PageHeader
        title="DevOps intelligence"
        description="Deployment health verdict first — then event detail for your engineering lead."
      />

      <section className="rounded-[24px] border border-border-subtle bg-pure-white px-6 py-6 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
                VERDICT_BADGE[health.verdict],
              )}
            >
              {health.verdictLabel}
            </span>
            <h2 className="mt-3 font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
              {health.headline}
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ash">{health.subcopy}</p>
          </div>
        </div>
      </section>

      <BriefingHighlights highlights={highlights} />

      {devopsAgent && (
        <Card className="bg-sky-wash/40">
          <CardHeader>
            <CardTitle>{devopsAgent.displayName}</CardTitle>
            <CardDescription>{devopsAgent.description}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-secondary">
            Status <Badge variant="ai">{devopsAgent.status}</Badge> · confidence{" "}
            <span className="font-medium text-ink">
              {(devopsAgent.confidenceScore * 100).toFixed(0)}%
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Deployment events</CardTitle>
          <CardDescription>Grouped by most recent — degraded items flagged</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ctx.deploymentEvents.length === 0 ? (
            <p className="text-sm text-muted">
              Deploy an approved release to generate deployment intelligence.
            </p>
          ) : (
            ctx.deploymentEvents.map((d) => (
              <div
                key={d.id}
                className={cn(
                  "rounded-xl border border-border-subtle bg-elevated p-4 text-sm",
                  d.health !== "HEALTHY" && "border-apricot/30 bg-apricot-wash/20",
                )}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-primary">{d.release?.name ?? "Release"}</span>
                  <Badge variant={d.health === "HEALTHY" ? "success" : "warning"}>
                    {d.health === "HEALTHY" ? "Healthy" : d.health}
                  </Badge>
                </div>
                <p className="mt-2 text-secondary">{d.notes}</p>
                {d.rollbackRecommended && (
                  <p className="mt-2 text-warning">{d.rollbackReason}</p>
                )}
                {d.releaseId && (
                  <Link
                    href={`/releases/${d.releaseId}`}
                    className="mt-2 inline-block text-ink underline-offset-4 hover:underline"
                  >
                    View release →
                  </Link>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {rollbacks.length > 0 && (
        <Card className="border-apricot-wash bg-apricot-wash/30">
          <CardHeader>
            <CardTitle>Rollback intelligence</CardTitle>
            <CardDescription>Pending human approval for remediation</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="ink" size="lg">
              <Link href="/approvals">Review remediation approvals</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <Link href="/observability">Observability center</Link>
        </Button>
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <Link href="/incidents">Incidents</Link>
        </Button>
      </div>
    </div>
  );
}
