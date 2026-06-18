import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { PageHeader } from "@/components/layout/page-header";
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
    <div className="space-y-8">
      <PageHeader
        title="Reports & analytics"
        description="Delivery confidence, governance health, and operational intelligence summaries."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-sky-wash/40">
          <CardHeader className="pb-2">
            <CardDescription>Governance score</CardDescription>
            <CardTitle className="text-2xl text-ink">{ctx.stats.governanceScore}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg release readiness</CardDescription>
            <CardTitle className="text-2xl text-ink">{ctx.stats.releaseReadiness}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approvals granted</CardDescription>
            <CardTitle className="text-2xl text-ink">{approved}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-apricot-wash/40">
          <CardHeader className="pb-2">
            <CardDescription>Deployments executed</CardDescription>
            <CardTitle className="text-2xl text-rust">{deployed}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Governance summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-secondary sm:grid-cols-2">
          <p>Active releases: <span className="font-medium text-ink">{ctx.stats.activeReleases}</span></p>
          <p>Open incidents: <span className="font-medium text-ink">{ctx.stats.openIncidents}</span></p>
          <p>Metrics ingested: <span className="font-medium text-ink">{ctx.stats.metricCount}</span></p>
          <p>Degraded deployments: <span className="font-medium text-ink">{ctx.stats.degradedDeployments}</span></p>
          <p>Rollback recommended: <span className="font-medium text-ink">{ctx.stats.rollbackPending}</span></p>
          <p>Pending recommendations: <span className="font-medium text-ink">{ctx.stats.pendingRecommendations}</span></p>
          <p>Rejected approvals: <span className="font-medium text-ink">{rejected}</span></p>
          <p>Connected integrations: <span className="font-medium text-ink">{ctx.stats.connectedTools}</span></p>
          <p>Active AI agents: <span className="font-medium text-ink">{ctx.stats.activeAgents}</span></p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <Link href="/qa">QA intelligence report</Link>
        </Button>
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <Link href="/observability">Observability</Link>
        </Button>
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <Link href="/devops">DevOps report</Link>
        </Button>
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <a href="/api/audit/export">Export audit CSV</a>
        </Button>
      </div>
    </div>
  );
}
