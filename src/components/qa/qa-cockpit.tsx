import Link from "next/link";
import type { Integration, Release } from "@/generated/prisma/client";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import type { TelemetrySnapshot } from "@/lib/release-governance";
import { hasObservabilitySynced } from "@/lib/observability-connectivity";
import { resolveAssessSourceFreshness } from "@/lib/release-assess-snapshot";
import { aggregateGapsByArea, verdictFromPrimary } from "@/lib/release-gate-brief";
import { ReleaseGateBrief } from "@/components/releases/release-gate-brief";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type QACockpitProps = {
  orgReadinessIndex: number;
  releases: Release[];
  integrations: Integration[];
  pendingApprovalReleaseIds: Set<string>;
};

function integrationStatusLabel(integration: Integration): string {
  if (integration.status === "CONNECTED" && integration.lastSyncAt) return "Synced";
  if (integration.status === "CONNECTED") return "Connected";
  return integration.status.toLowerCase();
}

export function QACockpit({
  orgReadinessIndex,
  releases,
  integrations,
  pendingApprovalReleaseIds,
}: QACockpitProps) {
  const assessed = releases.filter((r) => r.assessedAt);
  const pendingDecisions = releases.filter((r) => r.status === "PENDING_APPROVAL");
  const allGaps = assessed.flatMap((r) => JSON.parse(r.testGapsJson || "[]") as TestGap[]);
  const gapRollup = aggregateGapsByArea(allGaps);
  const observabilitySynced = hasObservabilitySynced(integrations);

  const keyProviders = ["JIRA", "GITHUB", "GRAFANA", "PROMETHEUS"] as const;
  const integrationHealth = keyProviders.map((provider) => {
    const row = integrations.find((i) => i.provider === provider);
    return {
      provider,
      connected: row?.status === "CONNECTED",
      synced: Boolean(row?.lastSyncAt),
      label: provider.charAt(0) + provider.slice(1).toLowerCase(),
      status: row ? integrationStatusLabel(row) : "not connected",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">QA intelligence dashboard</h1>
        <p className="mt-1 text-slate-400">
          Release confidence for governed delivery — correlate schedule, CI, metrics, and alerts
          into one human-approved go/no-go.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Org readiness index</CardDescription>
            <CardTitle className="text-2xl">{orgReadinessIndex}%</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Average across {assessed.length} assessed release
            {assessed.length === 1 ? "" : "s"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending decisions</CardDescription>
            <CardTitle className="text-2xl">{pendingDecisions.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Releases awaiting human approval
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open test gaps</CardDescription>
            <CardTitle className="text-2xl">{allGaps.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Across assessed releases
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Observability</CardDescription>
            <CardTitle className="text-lg">
              {observabilitySynced ? "Synced" : "Needs sync"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Metrics via direct Prometheus or Grafana proxy
          </CardContent>
        </Card>
      </div>

      {pendingDecisions.length > 0 && (
        <Card className="border-[#F59E0B]/30">
          <CardHeader>
            <CardTitle>Pending decisions</CardTitle>
            <CardDescription>Releases in approval queue with gate verdict preview</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingDecisions.map((release) => {
              const verdict = verdictFromPrimary(release.primaryRecommendation);
              return (
                <div
                  key={release.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#131A2A]/60 px-3 py-2"
                >
                  <div>
                    <Link
                      href={`/releases/${release.id}`}
                      className="font-medium text-[#93b4ff] hover:underline"
                    >
                      {release.name}
                      {release.version ? ` (${release.version})` : ""}
                    </Link>
                    <p className="text-sm text-slate-500">
                      Readiness {Math.round(release.readinessScore ?? 0)}% · Risk{" "}
                      {release.riskLevel ?? "—"}
                    </p>
                  </div>
                  {verdict && (
                    <Badge
                      variant={
                        verdict === "GO" ? "success" : verdict === "HOLD" ? "warning" : "error"
                      }
                    >
                      {verdict}
                    </Badge>
                  )}
                </div>
              );
            })}
            <Link href="/approvals" className="text-sm text-[#93b4ff] hover:underline">
              Go to Approval Center →
            </Link>
          </CardContent>
        </Card>
      )}

      {gapRollup.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Open gaps by area</CardTitle>
            <CardDescription>Aggregated test gaps across assessed releases</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {gapRollup.map((row) => (
                <Badge key={row.area} variant="muted">
                  {row.area}: {row.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Integration health</CardTitle>
          <CardDescription>Connected and synced status per source</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {integrationHealth.map((row) => (
            <div
              key={row.provider}
              className="flex items-center justify-between rounded-lg bg-[#131A2A]/60 px-3 py-2 text-sm"
            >
              <span>{row.label}</span>
              <Badge
                variant={
                  row.synced ? "success" : row.connected ? "warning" : "muted"
                }
              >
                {row.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {assessed.length === 0 ? (
        <Card className="border-dashed border-[#4F8CFF]/30">
          <CardContent className="py-10 text-center text-slate-400">
            Run a release assessment to populate QA intelligence.
            <Button asChild className="mt-4" size="sm">
              <Link href="/releases">View releases</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Assessed releases</h2>
          {assessed.map((release) => {
            const qaSignals = JSON.parse(release.qaSignalsJson || "[]") as QASignal[];
            const testGaps = JSON.parse(release.testGapsJson || "[]") as TestGap[];
            const telemetry = JSON.parse(release.telemetryJson || "{}") as TelemetrySnapshot;
            const sourceFreshness = resolveAssessSourceFreshness(integrations);
            const pendingCount = pendingApprovalReleaseIds.has(release.id) ? 1 : 0;

            return (
              <ReleaseGateBrief
                key={release.id}
                releaseId={release.id}
                releaseName={release.name}
                version={release.version}
                environment={release.environment}
                readinessScore={release.readinessScore}
                governanceRiskScore={release.governanceRiskScore}
                riskLevel={release.riskLevel}
                primaryRecommendation={release.primaryRecommendation}
                assessmentSummary={release.assessmentSummary}
                qaSignals={qaSignals}
                testGaps={testGaps}
                telemetry={telemetry}
                assessedAt={release.assessedAt}
                sourceFreshness={sourceFreshness}
                pendingApprovals={
                  pendingCount > 0
                    ? { count: pendingCount, roles: [] }
                    : undefined
                }
                compact
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
