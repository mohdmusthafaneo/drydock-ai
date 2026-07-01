import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
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
import { assessReleaseGovernance } from "@/lib/release-governance";
import { buildAssessmentSnapshot } from "@/lib/release-assess-snapshot";
import { parseToolchainMapping, resolveEffectiveToolchainMapping } from "@/lib/toolchain-mapping";
import { assessPortfolioJiraHygiene, summarizePortfolioHygiene } from "@/lib/jira-hygiene";
import { parseJiraMeta } from "@/lib/jira-meta";
import {
  parseGovernancePolicy,
  resolveGovernancePolicyForProject,
} from "@/lib/governance/policy";
import { logAgentActivity, logAgentAudit } from "../audit";
import { isToolAllowed } from "./registry";

function parseServiceScope(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export async function buildReleaseAssessContext(
  organizationId: string,
  releaseId: string,
) {
  const release = await prisma.release.findFirst({
    where: { id: releaseId, organizationId },
  });

  if (!release) return null;

  const [dna, profile, integrations, governancePolicyRow] = await Promise.all([
    prisma.deliveryDNA.findUnique({ where: { organizationId } }),
    prisma.organizationProfile.findUnique({ where: { organizationId } }),
    prisma.integration.findMany({ where: { organizationId } }),
    prisma.governancePolicy.findUnique({ where: { organizationId } }),
  ]);

  if (!dna) return { release, error: "Delivery DNA not configured" as const };

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

  const github = resolveGitHubAssessContext({ integrations, releaseBranch });
  const codeAnalysis = resolveCodeAnalysisAssessContext({
    integrations,
    repos: analysisRepos,
    branch: releaseBranch,
  });

  const jiraIntegration = integrations.find((i) => i.provider === "JIRA");
  const jiraMeta = jiraIntegration ? parseJiraMeta(jiraIntegration.metadataJson) : null;
  const effectiveMapping = await resolveEffectiveToolchainMapping(organizationId);
  const jiraHygiene =
    jiraMeta?.deliverySnapshot && effectiveMapping
      ? summarizePortfolioHygiene(
          assessPortfolioJiraHygiene(jiraMeta.deliverySnapshot, effectiveMapping),
        )
      : null;

  return {
    release,
    dna,
    profile,
    integrations,
    jira,
    grafana,
    prometheus,
    metrics,
    github,
    codeAnalysis,
    governancePolicy,
    jiraHygiene,
  };
}

export type AssessReleaseResult = {
  skipped: boolean;
  reason?: string;
  assessment?: ReturnType<typeof assessReleaseGovernance>;
  recommendationId?: string;
  releaseId: string;
};

export async function assessReleaseForAgent(input: {
  organizationId: string;
  agentId: string;
  agentType: string;
  releaseId: string;
  tx?: Prisma.TransactionClient;
}): Promise<AssessReleaseResult> {
  if (!isToolAllowed(input.agentType as never, "assess_release")) {
    return {
      skipped: true,
      reason: "Tool not allowed for agent type",
      releaseId: input.releaseId,
    };
  }

  const ctx = await buildReleaseAssessContext(
    input.organizationId,
    input.releaseId,
  );

  if (!ctx) {
    return {
      skipped: true,
      reason: "Release not found",
      releaseId: input.releaseId,
    };
  }

  if ("error" in ctx) {
    return {
      skipped: true,
      reason: ctx.error,
      releaseId: input.releaseId,
    };
  }

  const { release } = ctx;

  if (release.status !== "DETECTED") {
    return {
      skipped: true,
      reason: `Release status is ${release.status}`,
      releaseId: input.releaseId,
    };
  }

  const existingRec = await prisma.recommendation.findFirst({
    where: {
      organizationId: input.organizationId,
      releaseId: release.id,
      status: "PENDING",
    },
  });

  if (existingRec) {
    return {
      skipped: true,
      reason: "Pending recommendation already exists",
      recommendationId: existingRec.id,
      releaseId: input.releaseId,
    };
  }

  const assessment = assessReleaseGovernance({
    profile: ctx.profile,
    dna: ctx.dna,
    integrations: ctx.integrations,
    releaseName: release.name,
    version: release.version,
    environment: release.environment,
    jira: ctx.jira,
    grafana: ctx.grafana,
    prometheus: ctx.prometheus,
    metrics: ctx.metrics,
    github: ctx.github,
    codeAnalysis: ctx.codeAnalysis,
    governancePolicy: ctx.governancePolicy,
    jiraHygiene: ctx.jiraHygiene,
  });

  const assessmentSnapshot = buildAssessmentSnapshot({
    assessment,
    metrics: ctx.metrics,
    github: ctx.github,
  });

  const primaryRec = assessment.recommendations[0];

  const runTx = async (tx: Prisma.TransactionClient) => {
    const recommendation = await tx.recommendation.create({
      data: {
        organizationId: input.organizationId,
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
        organizationId: input.organizationId,
        recommendationId: recommendation.id,
        requestedByAgentId: input.agentId,
        riskScore: assessment.governanceRiskScore / 100,
      },
    });

    await tx.release.update({
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
        assessedAt: new Date(),
      },
    });

    if (
      assessment.riskLevel === "HIGH" ||
      assessment.riskLevel === "CRITICAL"
    ) {
      await tx.incident.create({
        data: {
          organizationId: input.organizationId,
          releaseId: release.id,
          title: `Elevated risk detected for ${release.name}`,
          description: assessment.summary,
          severityScore: Math.round(assessment.governanceRiskScore),
          status: "OPEN",
        },
      });
    }

    await logAgentActivity(tx, {
      organizationId: input.organizationId,
      type: "release.assessed",
      title: `Agent assessed release: ${release.name}`,
      description: assessment.summary,
      metadata: {
        agentId: input.agentId,
        releaseId: release.id,
        governanceRiskScore: assessment.governanceRiskScore,
      },
    });

    await logAgentAudit(tx, {
      organizationId: input.organizationId,
      action: "agent.release.assessed",
      entityType: "Release",
      entityId: release.id,
      agentId: input.agentId,
      metadata: {
        recommendationId: recommendation.id,
        riskLevel: assessment.riskLevel,
      },
    });

    return recommendation.id;
  };

  const recommendationId = input.tx
    ? await runTx(input.tx)
    : await prisma.$transaction(runTx);

  return {
    skipped: false,
    assessment,
    recommendationId,
    releaseId: input.releaseId,
  };
}
