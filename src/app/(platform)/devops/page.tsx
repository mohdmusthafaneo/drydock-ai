import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import {
  buildDeploymentHealthHighlights,
  buildDeploymentHealthSummary,
} from "@/lib/governance/presentation";
import { loadLatestDevOpsRun } from "@/lib/agent-analysis/load-latest-runs";
import { syncAgentAnalysisRecommendations } from "@/lib/agent-analysis/sync-recommendations";
import { isAwsTrulyConnected } from "@/lib/aws-meta";
import { PageHeader } from "@/components/layout/page-header";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { RevealSection } from "@/components/motion/reveal-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DevOpsAccountScanPanel } from "@/components/devops/devops-account-scan-panel";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";

const VERDICT_BADGE = {
  good: "border-dove/50 bg-fog text-ash",
  attention: "border-apricot/40 bg-apricot-wash/60 text-rust",
  risk: "border-rust/25 bg-rust/8 text-rust",
  neutral: "border-dove/50 bg-fog text-graphite",
} as const;

export default async function DevOpsIntelligencePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [ctx, devopsRun] = await Promise.all([
    getOrganizationContext(session.organizationId),
    loadLatestDevOpsRun(session.organizationId),
  ]);
  if (!ctx.dna) redirect("/governance/setup");

  void syncAgentAnalysisRecommendations(session.organizationId, {
    qa: null,
    devops: devopsRun,
    governance: null,
    productivity: null,
    freshness: [],
  }).catch(() => undefined);

  const health = buildDeploymentHealthSummary(ctx);
  const highlights = buildDeploymentHealthHighlights(ctx);
  const rollbacks = ctx.deploymentEvents.filter((d) => d.rollbackRecommended);
  const awsIntegration = ctx.integrations.find((i) => i.provider === "AWS");
  const awsConnected = isAwsTrulyConnected(awsIntegration);
  const hasDeployments = ctx.deploymentEvents.length > 0;
  const skipReason = !awsConnected
    ? "DevOps agent refresh is skipped until AWS role ARN + External ID are saved on Integrations."
    : !devopsRun
      ? "AWS is connected — waiting for the next scheduled scan (or Refresh all agents)."
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="DevOps intelligence"
        description="Cloud hygiene and deployment health — recommend-only remediations for your engineering lead (auto-refreshed on schedule)."
      >
        <AgentAnalysisRefreshButton label="Refresh all agents" />
      </PageHeader>

      {skipReason && !devopsRun ? (
        <p className="rounded-xl border border-border-subtle bg-elevated px-4 py-3 text-sm text-secondary">
          {skipReason}{" "}
          {!awsConnected ? (
            <Link href="/integrations" className="text-ink underline-offset-4 hover:underline">
              Configure AWS →
            </Link>
          ) : null}
        </p>
      ) : null}

      <DevOpsAccountScanPanel run={devopsRun} awsConnected={awsConnected} />

      {hasDeployments ? (
        <>
          <RevealSection className="rounded-[24px] border border-border-subtle bg-pure-white px-6 py-6 shadow-[var(--shadow)]">
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
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ash">
                  {health.subcopy}
                </p>
              </div>
            </div>
          </RevealSection>

          <RevealSection>
            <BriefingHighlights highlights={highlights} />
          </RevealSection>

          <Card>
            <CardHeader>
              <CardTitle>Deployment events</CardTitle>
              <CardDescription>Grouped by most recent — degraded items flagged</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {ctx.deploymentEvents.map((d) => (
                <div
                  key={d.id}
                  className={cn(
                    "rounded-xl border border-border-subtle bg-elevated p-4 text-sm",
                    d.health !== "HEALTHY" && "border-apricot/30 bg-apricot-wash/20",
                  )}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-primary">
                      {d.release?.name ?? "Release"}
                    </span>
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
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}

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
          <Link href="/integrations">AWS integration</Link>
        </Button>
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
