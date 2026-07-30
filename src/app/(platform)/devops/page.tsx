import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { buildDevOpsPageView } from "@/lib/agent-analysis/presentation";
import { loadLatestDevOpsRun } from "@/lib/agent-analysis/load-latest-runs";
import { syncAgentAnalysisRecommendations } from "@/lib/agent-analysis/sync-recommendations";
import { isAwsTrulyConnected } from "@/lib/aws-meta";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ClusteredFindingsList,
  DevOpsAccountScanPanel,
} from "@/components/devops/devops-account-scan-panel";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";
import { AgentPageShell } from "@/components/agent-analysis/agent-page-shell";
import { EngineeringDetailSection } from "@/components/agent-analysis/engineering-detail-section";
import { SegmentedShareBar } from "@/components/agent-analysis/segmented-share-bar";

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

  const rollbacks = ctx.deploymentEvents.filter((d) => d.rollbackRecommended);
  const awsIntegration = ctx.integrations.find((i) => i.provider === "AWS");
  const awsConnected = isAwsTrulyConnected(awsIntegration);
  const hasDeployments = ctx.deploymentEvents.length > 0;
  const skipReason = !awsConnected
    ? "DevOps agent refresh is skipped until AWS role ARN + External ID are saved on Integrations."
    : !devopsRun
      ? "AWS is connected — waiting for the next scheduled scan (or Refresh all agents)."
      : null;

  const view = buildDevOpsPageView(devopsRun, {
    degradedDeployments: ctx.stats.degradedDeployments,
    rollbackPending: ctx.stats.rollbackPending,
    deploymentEventCount: ctx.deploymentEvents.length,
  });

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

      <AgentPageShell
        view={view}
        afterHighlights={
          devopsRun ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ClusteredFindingsList findings={view.clusteredFindings} />
              <SegmentedShareBar
                title="Severity mix"
                description="Share of findings by severity"
                segments={view.severitySegments}
              />
            </div>
          ) : null
        }
      >
        <div className="space-y-4 border-t border-border-subtle pt-8">
          <EngineeringDetailSection
            title="Scan coverage and inventory"
            description="Resource mix and partial-coverage notes from the latest AWS scan."
            count={devopsRun?.resourcesCount}
          >
            <DevOpsAccountScanPanel
              run={devopsRun}
              awsConnected={awsConnected}
              section="coverage"
            />
          </EngineeringDetailSection>

          {hasDeployments ? (
            <EngineeringDetailSection
              title="Deployment events"
              description="Grouped by most recent — degraded items flagged"
              count={ctx.deploymentEvents.length}
            >
              <div className="space-y-3">
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
              </div>
            </EngineeringDetailSection>
          ) : null}

          <EngineeringDetailSection
            title="Raw finding sample"
            description="Unclustered evidence from the agent run"
            count={devopsRun?.topFindings.length}
          >
            <DevOpsAccountScanPanel
              run={devopsRun}
              awsConnected={awsConnected}
              section="findings"
            />
          </EngineeringDetailSection>
        </div>
      </AgentPageShell>

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
