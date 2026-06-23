import Link from "next/link";
import type { Integration, Release } from "@/generated/prisma/client";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import type { TelemetrySnapshot } from "@/lib/release-governance";
import { hasObservabilitySynced } from "@/lib/observability-connectivity";
import { resolveAssessSourceFreshness } from "@/lib/release-assess-snapshot";
import { aggregateGapsByArea, verdictFromPrimary } from "@/lib/release-gate-brief";
import { buildQaOrgVerdict } from "@/lib/governance/presentation";
import { ReleaseGateBrief } from "@/components/releases/release-gate-brief";
import { ExecutiveVerdictBanner } from "@/components/executive-briefing/executive-verdict-banner";
import { PageHeader } from "@/components/layout/page-header";
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

  const noGoCount = assessed.filter(
    (r) => verdictFromPrimary(r.primaryRecommendation) === "NO-GO",
  ).length;
  const holdCount = assessed.filter(
    (r) => verdictFromPrimary(r.primaryRecommendation) === "HOLD",
  ).length;
  const orgVerdict = buildQaOrgVerdict({
    orgReadinessIndex,
    pendingDecisions: pendingDecisions.length,
    openGaps: allGaps.length,
    noGoCount,
    holdCount,
    assessedCount: assessed.length,
  });

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
    <div className="space-y-8">
      <PageHeader
        title="QA intelligence dashboard"
        description="Release confidence for governed delivery — correlate schedule, CI, metrics, and alerts into one human-approved go/no-go."
      />

      <ExecutiveVerdictBanner
        verdict={orgVerdict.verdict}
        verdictLabel={orgVerdict.verdictLabel}
        headline={orgVerdict.headline}
        subcopy={orgVerdict.subcopy}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-sky-wash/50">
          <CardHeader className="pb-2">
            <CardDescription>Org readiness index</CardDescription>
            <CardTitle className="text-2xl text-ink">{orgReadinessIndex}%</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted">
            Average across {assessed.length} assessed release
            {assessed.length === 1 ? "" : "s"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending decisions</CardDescription>
            <CardTitle className="text-2xl text-ink">{pendingDecisions.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted">
            Releases awaiting human approval
          </CardContent>
        </Card>
        <Card className="bg-apricot-wash/50">
          <CardHeader className="pb-2">
            <CardDescription>Open test gaps</CardDescription>
            <CardTitle className="text-2xl text-rust">{allGaps.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted">
            Across assessed releases
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Observability</CardDescription>
            <CardTitle className="text-lg text-ink">
              {observabilitySynced ? "Synced" : "Needs sync"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted">
            Metrics via direct Prometheus or Grafana proxy
          </CardContent>
        </Card>
      </div>

      {pendingDecisions.length > 0 && (
        <Card className="border-apricot-wash bg-apricot-wash/30">
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
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-pure-white px-3 py-2 shadow-[var(--shadow-subtle)]"
                >
                  <div>
                    <Link
                      href={`/releases/${release.id}`}
                      className="font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {release.name}
                      {release.version ? ` (${release.version})` : ""}
                    </Link>
                    <p className="text-sm text-muted">
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
            <Button asChild size="sm" variant="link" className="h-auto px-0">
              <Link href="/approvals">Go to Approval Center →</Link>
            </Button>
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
              className="flex items-center justify-between rounded-xl bg-elevated px-3 py-2 text-sm"
            >
              <span className="text-primary">{row.label}</span>
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
        <Card className="border-dashed border-border">
          <CardContent className="py-10 text-center text-muted">
            Run a release assessment to populate QA intelligence.
            <div className="mt-4">
              <Button asChild variant="ink" size="lg">
                <Link href="/releases">View releases</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-[22px] font-medium tracking-[-0.2px] text-ink">Assessed releases</h2>
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
