import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import type { TelemetrySnapshot } from "@/lib/release-governance";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReleaseWorkflow } from "@/components/releases/release-workflow";
import { AssessReleaseButton, DeployReleaseButton } from "@/components/releases/release-actions";

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const release = await prisma.release.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      recommendations: { include: { approvals: true } },
    },
  });

  if (!release) notFound();

  const qaSignals = JSON.parse(release.qaSignalsJson || "[]") as QASignal[];
  const testGaps = JSON.parse(release.testGapsJson || "[]") as TestGap[];
  const telemetry = JSON.parse(release.telemetryJson || "{}") as TelemetrySnapshot;

  const pendingApprovals = release.recommendations.flatMap((r) =>
    r.approvals.filter((a) => !a.decision),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/releases" className="text-sm text-[#93b4ff] hover:underline">
          ← Releases
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {release.name}
              {release.version ? ` (${release.version})` : ""}
            </h1>
            <p className="text-slate-400">{release.environment}</p>
          </div>
          <Badge variant="ai">{release.status.replace(/_/g, " ")}</Badge>
        </div>
      </div>

      <ReleaseWorkflow status={release.status} />

      {release.status === "DETECTED" && (
        <Card className="border-[#4F8CFF]/30 bg-[#4F8CFF]/10">
          <CardHeader>
            <CardTitle>Run assessment</CardTitle>
            <CardDescription>
              Collect telemetry & QA signals, compute governance risk and readiness scores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssessReleaseButton releaseId={release.id} />
          </CardContent>
        </Card>
      )}

      {release.assessmentSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Assessment summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">{release.assessmentSummary}</CardContent>
        </Card>
      )}

      {(release.readinessScore != null || release.governanceRiskScore != null) && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>QA readiness</CardDescription>
              <CardTitle className="text-2xl">
                {Math.round(release.readinessScore ?? 0)}%
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Governance risk</CardDescription>
              <CardTitle className="text-2xl">
                {Math.round(release.governanceRiskScore ?? 0)}%
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Risk level</CardDescription>
              <CardTitle className="text-xl">{release.riskLevel ?? "—"}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {qaSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>QA signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {qaSignals.map((s) => (
              <div
                key={s.id}
                className="flex justify-between gap-2 rounded-lg bg-[#131A2A]/60 px-3 py-2 text-sm"
              >
                <span>
                  <span className="text-slate-500">{s.label}: </span>
                  {s.value}
                </span>
                <Badge variant={s.severity === "critical" ? "warning" : "muted"}>
                  {s.category}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {testGaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test gap analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {testGaps.map((g, i) => (
              <div key={i} className="rounded-lg bg-[#131A2A]/60 px-3 py-2 text-sm">
                <span className="font-medium">{g.area}</span> — {g.gap}
                <Badge className="ml-2" variant={g.priority === "high" ? "warning" : "muted"}>
                  {g.priority}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {release.telemetryJson !== "{}" && release.assessedAt && (
        <Card>
          <CardHeader>
            <CardTitle>Telemetry snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p>Deployments (24h): {telemetry.deployments24h ?? 0}</p>
            <p>Open incidents: {telemetry.openIncidents ?? 0}</p>
            <p>Error rate delta: {telemetry.errorRateDelta ?? "—"}</p>
            <p>Coverage: {telemetry.observabilityCoverage ?? "—"}</p>
          </CardContent>
        </Card>
      )}

      {release.regressionNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Regression intelligence</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">{release.regressionNotes}</CardContent>
        </Card>
      )}

      {release.status === "PENDING_APPROVAL" && pendingApprovals.length > 0 && (
        <Card className="border-[#F59E0B]/30">
          <CardHeader>
            <CardTitle>Pending human approval</CardTitle>
            <CardDescription>
              {pendingApprovals.length} recommendation(s) require sign-off
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/approvals" className="text-[#93b4ff] hover:underline">
              Go to Approval Center →
            </Link>
          </CardContent>
        </Card>
      )}

      {release.status === "APPROVED" && (
        <Card className="border-[#10B981]/30 bg-[#10B981]/10">
          <CardHeader>
            <CardTitle>Controlled deployment</CardTitle>
            <CardDescription>Execute deployment after governance approval</CardDescription>
          </CardHeader>
          <CardContent>
            <DeployReleaseButton releaseId={release.id} />
          </CardContent>
        </Card>
      )}

      {release.status === "DEPLOYED" && (
        <div className="rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 px-4 py-3 text-sm text-[#6ee7b7]">
          Deployed {release.deployedAt?.toLocaleString()} — audit trail recorded.
        </div>
      )}
    </div>
  );
}
