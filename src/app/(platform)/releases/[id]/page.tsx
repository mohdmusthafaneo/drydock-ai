import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import type { TelemetrySnapshot } from "@/lib/release-governance";
import { readJsonField } from "@/lib/json-field";
import {
  isAssessDataStale,
  parsePostDeployComparison,
  resolveAssessSourceFreshness,
} from "@/lib/release-assess-snapshot";
import { matchReleaseToFixVersion } from "@/lib/jira-delivery-health";
import { resolveEffectiveToolchainMapping } from "@/lib/toolchain-mapping";
import { resolveLowJiraHygieneForRelease } from "@/lib/jira-hygiene";
import { isJiraOAuthConnected, parseJiraMeta } from "@/lib/jira-meta";
import { buildReleaseDetailVerdict, displayRoleLabel } from "@/lib/governance/presentation";
import { parseGovernancePolicy } from "@/lib/governance/policy";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verdictBadgeVariant } from "@/lib/release-gate-brief";
import { AssessReleaseButton, DeployReleaseButton } from "@/components/releases/release-actions";
import { ReleaseGateBrief } from "@/components/releases/release-gate-brief";
import { ExecutiveVerdictBanner } from "@/components/executive-briefing/executive-verdict-banner";
import { RevealSection } from "@/components/motion/reveal-section";
import { HoverLift } from "@/components/motion/hover-lift";
import { buildJiraIssuesSearchUrl, buildSprintJql } from "@/lib/jira-issue-links";

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const [release, integrations, effectiveMapping, governancePolicy] = await Promise.all([
    prisma.release.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        recommendations: { include: { approvals: true } },
      },
    }),
    prisma.integration.findMany({
      where: { organizationId: session.organizationId },
    }),
    resolveEffectiveToolchainMapping(session.organizationId),
    prisma.governancePolicy.findUnique({
      where: { organizationId: session.organizationId },
    }),
  ]);

  if (!release) notFound();

  const qaSignals = readJsonField(release.qaSignalsJson, []) as QASignal[];
  const testGaps = readJsonField(release.testGapsJson, []) as TestGap[];
  const telemetry = readJsonField(release.telemetryJson, {}) as TelemetrySnapshot;
  const postDeployComparison = parsePostDeployComparison(release.postDeployComparisonJson);
  const sourceFreshness = resolveAssessSourceFreshness(integrations);
  const staleData =
    release.assessedAt != null &&
    isAssessDataStale({
      assessedAt: release.assessedAt,
      sourceFreshness,
    });

  const jiraIntegration = integrations.find((i) => i.provider === "JIRA" && isJiraOAuthConnected(i));
  const jiraMeta = jiraIntegration ? parseJiraMeta(jiraIntegration.metadataJson) : null;
  const matchedVersion =
    jiraMeta?.deliverySnapshot && release.assessedAt
      ? matchReleaseToFixVersion(
          release.name,
          release.version,
          jiraMeta.deliverySnapshot,
          effectiveMapping?.jira,
          release.jiraFixVersion,
          release.jiraSprintId,
        )
      : undefined;
  const scopeLabel =
    release.jiraSprintId != null
      ? `Sprint ${release.name}`
      : release.jiraFixVersion
        ? `Fix version ${release.jiraFixVersion}`
        : matchedVersion?.matchedOn === "sprint"
          ? `Sprint ${matchedVersion.versionName}`
          : matchedVersion
            ? `Fix version ${matchedVersion.versionName}`
            : null;
  const lowJiraHygiene = resolveLowJiraHygieneForRelease({
    hygiene: jiraMeta?.jiraHygiene,
    projectKey: matchedVersion?.projectKey ?? null,
  });

  const pendingApprovals = release.recommendations.flatMap((r) =>
    r.approvals.filter((a) => !a.decision),
  );
  const parsedPolicy = parseGovernancePolicy(governancePolicy);
  const labels = parsedPolicy.approvalLevelLabels ?? {};
  const pendingRoles = [
    ...new Set(
      release.recommendations
        .filter((r) => r.approvals.some((a) => !a.decision))
        .map((r) => r.requiredRole)
        .filter((role) => role != null)
        .map((role) => displayRoleLabel(role, labels)),
    ),
  ];
  const showGateBrief = release.assessedAt != null;
  const releaseVerdict = buildReleaseDetailVerdict(release);
  const jiraSprintUrl =
    release.jiraSprintId != null && jiraMeta?.siteUrl
      ? buildJiraIssuesSearchUrl(jiraMeta.siteUrl, buildSprintJql(release.jiraSprintId))
      : null;

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
            <h1 className="text-[28px] font-bold leading-[1.12] tracking-[-0.75px] text-ink">
              {release.name}
              {release.version ? ` (${release.version})` : ""}
            </h1>
            <p className="mt-2 text-[16px] text-ash">
              {release.environment}
              {scopeLabel ? ` · ${scopeLabel}` : ""}
              {release.branch ? ` · branch ${release.branch}` : ""}
              {release.jiraFixVersion && !release.jiraSprintId
                ? ` · Jira ${release.jiraFixVersion}`
                : ""}
              {release.serviceScope ? ` · project ${release.serviceScope}` : ""}
            </p>
            {jiraSprintUrl && (
              <a
                href={jiraSprintUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-[15px] font-medium text-chart-blue hover:underline"
              >
                Open sprint in Jira
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {releaseVerdict.gateVerdict && (
              <Badge variant={verdictBadgeVariant(releaseVerdict.gateVerdict)} className="px-2.5 py-1">
                {releaseVerdict.gateVerdict}
              </Badge>
            )}
            <Badge variant="ai">{release.status.replace(/_/g, " ")}</Badge>
          </div>
        </div>
      </div>

      <RevealSection>
        <ExecutiveVerdictBanner
          verdict={
            releaseVerdict.gateVerdict === "NO-GO"
              ? "risk"
              : releaseVerdict.gateVerdict === "HOLD"
                ? "attention"
                : releaseVerdict.gateVerdict === "GO"
                  ? "good"
                  : "neutral"
          }
          verdictLabel={releaseVerdict.verdictLabel}
          headline={releaseVerdict.headline}
          subcopy={releaseVerdict.subcopy}
        />
      </RevealSection>

      {["DETECTED", "PENDING_APPROVAL", "BLOCKED"].includes(release.status) && (
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

      {!showGateBrief && release.status === "DETECTED" && (
        <Card className="border-dashed border-border-subtle">
          <CardHeader>
            <CardTitle>Not yet assessed</CardTitle>
            <CardDescription>
              Expected signals after assessment: Jira schedule health, GitHub CI status, Grafana
              alerts, Prometheus metrics, and governance risk scoring.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {showGateBrief && (
        <RevealSection>
          <HoverLift>
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
              lowJiraHygiene={lowJiraHygiene}
              postDeployComparison={postDeployComparison}
            />
          </HoverLift>
        </RevealSection>
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
