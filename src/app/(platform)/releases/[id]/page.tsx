import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import type { TelemetrySnapshot } from "@/lib/release-governance";
import {
  isAssessDataStale,
  parsePostDeployComparison,
  resolveAssessSourceFreshness,
} from "@/lib/release-assess-snapshot";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReleaseWorkflow } from "@/components/releases/release-workflow";
import { AssessReleaseButton, DeployReleaseButton } from "@/components/releases/release-actions";
import { ReleaseGateBrief } from "@/components/releases/release-gate-brief";

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const [release, integrations] = await Promise.all([
    prisma.release.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        recommendations: { include: { approvals: true } },
      },
    }),
    prisma.integration.findMany({
      where: { organizationId: session.organizationId },
    }),
  ]);

  if (!release) notFound();

  const qaSignals = JSON.parse(release.qaSignalsJson || "[]") as QASignal[];
  const testGaps = JSON.parse(release.testGapsJson || "[]") as TestGap[];
  const telemetry = JSON.parse(release.telemetryJson || "{}") as TelemetrySnapshot;
  const postDeployComparison = parsePostDeployComparison(release.postDeployComparisonJson);
  const sourceFreshness = resolveAssessSourceFreshness(integrations);
  const staleData =
    release.assessedAt != null &&
    isAssessDataStale({
      assessedAt: release.assessedAt,
      sourceFreshness,
    });

  const pendingApprovals = release.recommendations.flatMap((r) =>
    r.approvals.filter((a) => !a.decision),
  );
  const pendingRoles = [
    ...new Set(
      release.recommendations
        .filter((r) => r.approvals.some((a) => !a.decision))
        .map((r) => r.requiredRole)
        .filter((role) => role != null)
        .map((role) => role.replace(/_/g, " ")),
    ),
  ];

  const showGateBrief = release.assessedAt != null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/releases"
          className="text-[15px] font-medium text-ink hover:text-rust"
        >
          ← Releases
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
              {release.name}
              {release.version ? ` (${release.version})` : ""}
            </h1>
            <p className="mt-2 text-[16px] text-ash">
              {release.environment}
              {release.branch ? ` · branch ${release.branch}` : ""}
              {release.jiraFixVersion ? ` · Jira ${release.jiraFixVersion}` : ""}
            </p>
          </div>
          <Badge variant="ai">{release.status.replace(/_/g, " ")}</Badge>
        </div>
      </div>

      <ReleaseWorkflow status={release.status} />

      {(release.status === "DETECTED" ||
        release.status === "PENDING_APPROVAL" ||
        release.status === "BLOCKED") && (
        <Card className="bg-sky-wash/50">
          <CardHeader>
            <CardTitle>
              {release.status === "DETECTED" ? "Run assessment" : "Re-assess release"}
            </CardTitle>
            <CardDescription>
              {release.status === "DETECTED"
                ? "Collect telemetry & QA signals, compute governance risk and readiness scores."
                : "Re-run assessment to refresh signals and replace pending recommendations."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssessReleaseButton releaseId={release.id} reAssess={release.status !== "DETECTED"} />
          </CardContent>
        </Card>
      )}

      {showGateBrief && (
        <ReleaseGateBrief
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
          pendingApprovals={
            pendingApprovals.length > 0
              ? { count: pendingApprovals.length, roles: pendingRoles }
              : undefined
          }
          sourceFreshness={sourceFreshness}
          staleData={staleData}
          postDeployComparison={postDeployComparison}
        />
      )}

      {release.regressionNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Regression intelligence</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ash">{release.regressionNotes}</CardContent>
        </Card>
      )}

      {release.status === "APPROVED" && (
        <Card className="bg-apricot-wash/40">
          <CardHeader>
            <CardTitle>Controlled deployment</CardTitle>
            <CardDescription>Execute deployment after governance approval</CardDescription>
          </CardHeader>
          <CardContent>
            <DeployReleaseButton releaseId={release.id} />
          </CardContent>
        </Card>
      )}

      {release.status === "DEPLOYED" && !postDeployComparison && (
        <div className="rounded-[16px] border border-success/20 bg-success-muted px-4 py-3 text-sm text-success">
          Deployed {release.deployedAt?.toLocaleString()} — audit trail recorded.
        </div>
      )}
    </div>
  );
}
