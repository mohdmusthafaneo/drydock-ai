import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function DevOpsIntelligencePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const devopsAgent = ctx.agents.find((a) => a.agentType === "DEVOPS_INTELLIGENCE");
  const rollbacks = ctx.deploymentEvents.filter((d) => d.rollbackRecommended);

  return (
    <div className="space-y-8">
      <PageHeader
        title="DevOps intelligence"
        description="Monitor deployments, review incidents, analyze rollback intelligence, approve remediation."
      />

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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deployments tracked</CardDescription>
            <CardTitle className="text-2xl text-ink">{ctx.deploymentEvents.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-apricot-wash/40">
          <CardHeader className="pb-2">
            <CardDescription>Degraded deploys</CardDescription>
            <CardTitle className="text-2xl text-rust">{ctx.stats.degradedDeployments}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rollback recommended</CardDescription>
            <CardTitle className="text-2xl text-ink">{ctx.stats.rollbackPending}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deployment events</CardTitle>
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
                className="rounded-xl border border-border-subtle bg-elevated p-4 text-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-primary">{d.release?.name ?? "Release"}</span>
                  <Badge
                    variant={d.health === "HEALTHY" ? "success" : "warning"}
                  >
                    {d.health}
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
