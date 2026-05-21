import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollectTelemetryButton } from "@/components/observability/collect-telemetry-button";
import { MetricBars } from "@/components/observability/metric-bars";

export default async function ObservabilityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const obsConnected = ctx.integrations.filter(
    (i) =>
      (i.provider === "GRAFANA" || i.provider === "PROMETHEUS") && i.status === "CONNECTED",
  );

  const latestDeploy = ctx.deploymentEvents[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Observability center</h1>
          <p className="mt-1 text-slate-400">
            Phase 2 — incident correlation, deployment intelligence, release degradation analysis.
          </p>
          <p className="mt-2 text-sm text-slate-500">{ctx.dna.observabilityStrategy}</p>
        </div>
        <CollectTelemetryButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Error rate</CardDescription>
            <CardTitle className="text-2xl">
              {ctx.stats.errorRate != null ? `${ctx.stats.errorRate}%` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>P95 latency</CardDescription>
            <CardTitle className="text-2xl">
              {ctx.stats.p95Latency != null ? `${ctx.stats.p95Latency}ms` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open incidents</CardDescription>
            <CardTitle className="text-2xl">{ctx.stats.openIncidents}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Metrics ingested</CardDescription>
            <CardTitle className="text-2xl">{ctx.stats.metricCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-[#4F8CFF]/20">
        <CardHeader>
          <CardTitle>Live metrics</CardTitle>
          <CardDescription>
            {obsConnected.length > 0
              ? `Sources: ${obsConnected.map((i) => i.provider).join(", ")}`
              : "Connect Grafana or Prometheus for richer signals"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetricBars metrics={ctx.telemetryMetrics} />
        </CardContent>
      </Card>

      {latestDeploy && (
        <Card>
          <CardHeader>
            <CardTitle>Deployment intelligence</CardTitle>
            <CardDescription>{latestDeploy.release?.name ?? "Latest deploy"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Health:{" "}
              <Badge
                variant={
                  latestDeploy.health === "HEALTHY"
                    ? "success"
                    : latestDeploy.health === "DEGRADED"
                      ? "warning"
                      : "warning"
                }
              >
                {latestDeploy.health}
              </Badge>{" "}
              · score {latestDeploy.healthScore}/100
            </p>
            {latestDeploy.rollbackRecommended && (
              <p className="text-[#fcd34d]">{latestDeploy.rollbackReason}</p>
            )}
            <p className="text-slate-500">{latestDeploy.notes}</p>
            <Link href="/devops" className="text-[#93b4ff] hover:underline">
              DevOps intelligence →
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Incidents</CardTitle>
          <CardDescription>Correlated with releases and telemetry</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ctx.incidents.length === 0 ? (
            <p className="text-sm text-slate-500">No incidents recorded.</p>
          ) : (
            ctx.incidents.slice(0, 5).map((inc) => (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="flex justify-between rounded-lg bg-[#131A2A]/60 px-3 py-2 text-sm hover:bg-[#1B2435]"
              >
                <span>{inc.title}</span>
                <Badge variant={inc.status === "OPEN" ? "warning" : "muted"}>
                  {inc.status}
                </Badge>
              </Link>
            ))
          )}
          <Button asChild variant="secondary" size="sm" className="mt-2">
            <Link href="/incidents">All incidents</Link>
          </Button>
        </CardContent>
      </Card>

      <Button asChild variant="secondary">
        <Link href="/integrations">Manage integrations</Link>
      </Button>
    </div>
  );
}
