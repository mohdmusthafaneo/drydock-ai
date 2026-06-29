import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { resolveCodeAnalysisAssessContext } from "@/lib/code-analysis-assess-context";
import { resolveGrafanaAssessContext } from "@/lib/grafana-assess-context";
import { resolveGitHubAssessContext } from "@/lib/github-assess-context";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { resolveJiraAssessContext } from "@/lib/jira-delivery-health";
import {
  resolvePrometheusAssessContext,
  resolveMetricsAssessContext,
  scopeMetricsContext,
} from "@/lib/observability-connectivity";
import { enqueueReleaseAssessedWakeups } from "@/lib/agent-control-plane/release-wakeups";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { assessReleaseGovernance } from "@/lib/release-governance";
import { buildAssessmentSnapshot } from "@/lib/release-assess-snapshot";
import { parseToolchainMapping } from "@/lib/toolchain-mapping";
import {
  parseGovernancePolicy,
  resolveGovernancePolicyForProject,
} from "@/lib/governance/policy";

const REASSESSABLE_STATUSES = new Set(["DETECTED", "ASSESSED", "PENDING_APPROVAL", "BLOCKED"]);

function parseServiceScope(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const release = await prisma.release.findFirst({
    where: { id, organizationId: session.organizationId },
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (!REASSESSABLE_STATUSES.has(release.status)) {
    return NextResponse.json(
      { error: "Release cannot be re-assessed in current status" },
      { status: 400 },
    );
  }

  const [dna, profile, integrations, governancePolicyRow] = await Promise.all([
    prisma.deliveryDNA.findUnique({
      where: { organizationId: session.organizationId },
    }),
    prisma.organizationProfile.findUnique({
      where: { organizationId: session.organizationId },
    }),
    prisma.integration.findMany({
      where: { organizationId: session.organizationId },
    }),
    prisma.governancePolicy.findUnique({
      where: { organizationId: session.organizationId },
    }),
  ]);

  if (!dna) {
    return NextResponse.json(
      { error: "Complete governance setup before assessing releases" },
      { status: 400 },
    );
  }

  const toolchainMapping = parseToolchainMapping(profile?.toolchainMappingJson);
  const jiraMapping = profile?.toolchainMappingConfirmedAt
    ? toolchainMapping.jira
    : undefined;
  const githubMapping = profile?.toolchainMappingConfirmedAt
    ? toolchainMapping.github
    : undefined;

  const releaseBranch =
    release.branch?.trim() ||
    githubMapping?.productionBranch ||
    githubMapping?.primaryDefaultBranch ||
    null;

  const serviceScopeIds = parseServiceScope(release.serviceScope);

  const jira = resolveJiraAssessContext({
    integrations,
    releaseName: release.name,
    version: release.version,
    jiraFixVersion: release.jiraFixVersion,
    mapping: jiraMapping,
  });

  const governanceDocument = parseGovernancePolicy(governancePolicyRow);
  const projectKey = jira.health?.matchedVersion?.projectKey ?? null;
  const governancePolicy = resolveGovernancePolicyForProject(governanceDocument, projectKey);

  const grafana = resolveGrafanaAssessContext({ integrations });
  const prometheus = resolvePrometheusAssessContext({ integrations });
  const metrics = scopeMetricsContext(
    resolveMetricsAssessContext({ integrations }),
    serviceScopeIds,
  );

  const githubIntegration = integrations.find((i) => i.provider === "GITHUB");
  const githubMeta = githubIntegration
    ? parseIntegrationMeta(githubIntegration.metadataJson)
    : null;
  const analysisRepos: string[] =
    githubMeta?.repoFullNames ??
    githubMeta?.repos?.map((r) => r.fullName) ??
    [];

  const github = resolveGitHubAssessContext({
    integrations,
    releaseBranch,
  });

  const codeAnalysis = resolveCodeAnalysisAssessContext({
    integrations,
    repos: analysisRepos,
    branch: releaseBranch,
  });

  const assessment = assessReleaseGovernance({
    profile,
    dna,
    integrations,
    releaseName: release.name,
    version: release.version,
    environment: release.environment,
    jira,
    grafana,
    prometheus,
    metrics,
    github,
    codeAnalysis,
    governancePolicy,
  });

  const assessmentSnapshot = buildAssessmentSnapshot({
    assessment,
    metrics,
    github,
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.recommendation.deleteMany({
      where: { organizationId: session.organizationId, releaseId: release.id },
    });

    const primaryRec = assessment.recommendations[0];
    const recommendation = await tx.recommendation.create({
      data: {
        organizationId: session.organizationId,
        releaseId: release.id,
        title: primaryRec.title,
        description: primaryRec.description,
        rationale: primaryRec.rationale,
        impact: primaryRec.impact,
        confidence: primaryRec.confidence,
        affectedSystems: JSON.stringify(primaryRec.affectedSystems),
        requiredRole: primaryRec.requiredRole ?? null,
        status: "PENDING",
      },
    });

    await tx.approval.create({
      data: {
        organizationId: session.organizationId,
        recommendationId: recommendation.id,
        riskScore: assessment.governanceRiskScore / 100,
      },
    });

    const updatedRelease = await tx.release.update({
      where: { id: release.id },
      data: {
        status: "PENDING_APPROVAL",
        governanceRiskScore: assessment.governanceRiskScore,
        readinessScore: assessment.qa.readinessScore,
        riskLevel: assessment.riskLevel,
        primaryRecommendation: assessment.primaryRecommendation,
        qaSignalsJson: JSON.stringify(assessment.qa.signals),
        telemetryJson: JSON.stringify(assessment.telemetry),
        testGapsJson: JSON.stringify(assessment.qa.testGaps),
        regressionNotes: assessment.qa.regressionNotes,
        assessmentSummary: assessment.summary,
        assessmentSnapshotJson: JSON.stringify(assessmentSnapshot),
        postDeployComparisonJson: "{}",
        assessedAt: new Date(),
      },
    });

    if (assessment.riskLevel === "HIGH" || assessment.riskLevel === "CRITICAL") {
      await tx.incident.create({
        data: {
          organizationId: session.organizationId,
          releaseId: release.id,
          title: `Elevated risk detected for ${release.name}`,
          description: assessment.summary,
          severityScore: Math.round(assessment.governanceRiskScore),
          status: "OPEN",
        },
      });
    }

    await tx.agentRegistry.updateMany({
      where: {
        organizationId: session.organizationId,
        agentType: { in: ["QA_INTELLIGENCE", "GOVERNANCE", "INCIDENT_CORRELATION"] },
      },
      data: { status: "ACTIVE", lastActiveAt: new Date() },
    });

    const completed = JSON.parse(
      (
        await tx.deliveryWorkflow.findUnique({
          where: { organizationId: session.organizationId },
        })
      )?.stepsCompletedJson || "[]",
    ) as string[];
    const nextSteps = [
      ...new Set([...completed, "correlation", "recommendations", "telemetry"]),
    ];
    await tx.deliveryWorkflow.updateMany({
      where: { organizationId: session.organizationId },
      data: {
        stepsCompletedJson: JSON.stringify(nextSteps),
        currentStepId: "approval",
      },
    });

    return { release: updatedRelease, recommendation };
  });

  await prisma.activityEvent.create({
    data: {
      organizationId: session.organizationId,
      type: "release.assessed",
      title: `Governance assessment: ${release.name}`,
      description: assessment.summary,
      metadataJson: JSON.stringify({
        releaseId: release.id,
        governanceRiskScore: assessment.governanceRiskScore,
        readinessScore: assessment.qa.readinessScore,
        primaryRecommendation: assessment.primaryRecommendation,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: session.organizationId,
      userId: session.userId,
      action: "release.assessed",
      entityType: "Release",
      entityId: release.id,
      metadataJson: JSON.stringify({
        riskLevel: assessment.riskLevel,
        governanceRiskScore: assessment.governanceRiskScore,
        primaryRecommendation: assessment.primaryRecommendation,
      }),
    },
  });

  await enqueueReleaseAssessedWakeups(session.organizationId, release.id);
  invalidateExecutiveBriefingSnapshot(session.organizationId);

  return NextResponse.json({
    ok: true,
    release: {
      id: updated.release.id,
      status: updated.release.status,
      readinessScore: updated.release.readinessScore,
      governanceRiskScore: updated.release.governanceRiskScore,
      riskLevel: updated.release.riskLevel,
      primaryRecommendation: assessment.primaryRecommendation,
      assessmentSummary: updated.release.assessmentSummary,
    },
    recommendations: [
      {
        id: updated.recommendation.id,
        title: updated.recommendation.title,
        requiredRole: updated.recommendation.requiredRole ?? undefined,
      },
    ],
  });
}
