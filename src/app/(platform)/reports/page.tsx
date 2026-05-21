import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const approved = ctx.approvals.filter((a) => a.decision === "APPROVED").length;
  const rejected = ctx.approvals.filter((a) => a.decision === "REJECTED").length;
  const deployed = ctx.releases.filter((r) => r.status === "DEPLOYED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports & analytics</h1>
        <p className="mt-1 text-slate-400">
          Delivery confidence, governance health, and operational intelligence summaries.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Governance score</CardDescription>
            <CardTitle className="text-2xl">{ctx.stats.governanceScore}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg release readiness</CardDescription>
            <CardTitle className="text-2xl">{ctx.stats.releaseReadiness}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approvals granted</CardDescription>
            <CardTitle className="text-2xl">{approved}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deployments executed</CardDescription>
            <CardTitle className="text-2xl">{deployed}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Governance summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Active releases: {ctx.stats.activeReleases}</p>
          <p>Open incidents: {ctx.stats.openIncidents}</p>
          <p>Metrics ingested: {ctx.stats.metricCount}</p>
          <p>Degraded deployments: {ctx.stats.degradedDeployments}</p>
          <p>Rollback recommended: {ctx.stats.rollbackPending}</p>
          <p>Pending recommendations: {ctx.stats.pendingRecommendations}</p>
          <p>Rejected approvals: {rejected}</p>
          <p>Connected integrations: {ctx.stats.connectedTools}</p>
          <p>Active AI agents: {ctx.stats.activeAgents}</p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href="/qa">QA intelligence report</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/observability">Observability</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/devops">DevOps report</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a href="/api/audit/export">Export audit CSV</a>
        </Button>
      </div>
    </div>
  );
}
