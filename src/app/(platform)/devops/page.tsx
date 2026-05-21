import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">DevOps intelligence</h1>
        <p className="mt-1 text-slate-400">
          Monitor deployments, review incidents, analyze rollback intelligence, approve remediation.
        </p>
      </div>

      {devopsAgent && (
        <Card className="border-[#4F8CFF]/20">
          <CardHeader>
            <CardTitle>{devopsAgent.displayName}</CardTitle>
            <CardDescription>{devopsAgent.description}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            Status <Badge variant="ai">{devopsAgent.status}</Badge> · confidence{" "}
            {(devopsAgent.confidenceScore * 100).toFixed(0)}%
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deployments tracked</CardDescription>
            <CardTitle className="text-2xl">{ctx.deploymentEvents.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Degraded deploys</CardDescription>
            <CardTitle className="text-2xl">{ctx.stats.degradedDeployments}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rollback recommended</CardDescription>
            <CardTitle className="text-2xl">{ctx.stats.rollbackPending}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deployment events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ctx.deploymentEvents.length === 0 ? (
            <p className="text-sm text-slate-500">
              Deploy an approved release to generate deployment intelligence.
            </p>
          ) : (
            ctx.deploymentEvents.map((d) => (
              <div
                key={d.id}
                className="rounded-lg border border-white/8 bg-[#131A2A]/60 p-4 text-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{d.release?.name ?? "Release"}</span>
                  <Badge
                    variant={d.health === "HEALTHY" ? "success" : "warning"}
                  >
                    {d.health}
                  </Badge>
                </div>
                <p className="mt-2 text-slate-400">{d.notes}</p>
                {d.rollbackRecommended && (
                  <p className="mt-2 text-[#fcd34d]">{d.rollbackReason}</p>
                )}
                {d.releaseId && (
                  <Link
                    href={`/releases/${d.releaseId}`}
                    className="mt-2 inline-block text-[#93b4ff] hover:underline"
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
        <Card className="border-[#F59E0B]/30">
          <CardHeader>
            <CardTitle>Rollback intelligence</CardTitle>
            <CardDescription>Pending human approval for remediation</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/approvals">Review remediation approvals</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href="/observability">Observability center</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/incidents">Incidents</Link>
        </Button>
      </div>
    </div>
  );
}
