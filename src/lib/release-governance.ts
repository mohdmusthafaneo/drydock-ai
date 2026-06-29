import type { DeliveryDNA, Integration, OrganizationProfile } from "@/generated/prisma/client";
import type { CodeAnalysisAssessContext } from "@/lib/code-analysis-assess-context";
import type { GitHubAssessContext } from "@/lib/github-assess-context";
import type { GrafanaAssessContext } from "@/lib/grafana-assess-context";
import type { JiraAssessContext } from "@/lib/jira-delivery-health";
import type { GovernancePolicyConfig } from "@/lib/governance/policy";
import {
  formatErrorRateDelta,
  formatObservabilityCoverage,
  resolveMetricsAssessContext,
  type PrometheusAssessContext,
} from "@/lib/observability-connectivity";
import type { MetricsAssessContext, MetricsProvenance } from "@/lib/observability-metrics/types";
import type { QAAssessment } from "@/lib/qa-intelligence";
import { assessQAIntelligence } from "@/lib/qa-intelligence";

export type PrimaryRecommendation = "HOLD" | "APPROVE_WITH_SIGNOFF" | "APPROVE";

export type TelemetrySnapshot = {
  deployments24h: number;
  openIncidents: number;
  errorRateDelta: string;
  observabilityCoverage: string;
  metricsProvenance?: MetricsProvenance | null;
  assessedAt?: string;
};

export type GovernanceRecommendation = {
  title: string;
  description: string;
  rationale: string;
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  affectedSystems: string[];
  requiredRole?: "QA_LEAD" | "DEVOPS_LEAD" | "ENGINEERING_MANAGER";
  supporting?: boolean;
};

export type GovernanceAssessment = {
  governanceRiskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  primaryRecommendation: PrimaryRecommendation;
  telemetry: TelemetrySnapshot;
  qa: QAAssessment;
  summary: string;
  recommendations: GovernanceRecommendation[];
};

function riskLevelFromScore(score: number): GovernanceAssessment["riskLevel"] {
  if (score >= 75) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
}

function resolveOpenIncidents(
  grafana: GrafanaAssessContext | undefined,
  metrics: MetricsAssessContext | undefined,
  prometheus: PrometheusAssessContext | undefined,
): number {
  if (grafana?.synced) return grafana.openAlerts;
  if (metrics?.synced && metrics.snapshot) {
    return metrics.snapshot.kpis.openAlerts;
  }
  if (prometheus?.synced && prometheus.snapshot) {
    return prometheus.snapshot.kpis.openAlerts;
  }
  return 0;
}

function resolveDeployments24h(grafana: GrafanaAssessContext | undefined): number {
  if (grafana?.synced && grafana.snapshot) {
    return grafana.snapshot.kpis.annotations24h;
  }
  return 0;
}

function buildPrimaryDecision(input: {
  releaseName: string;
  environment: string;
  dna: DeliveryDNA;
  qa: QAAssessment;
  governanceRiskScore: number;
  riskLevel: GovernanceAssessment["riskLevel"];
  jira?: JiraAssessContext;
  grafana?: GrafanaAssessContext;
  metrics: MetricsAssessContext;
  codeAnalysis?: CodeAnalysisAssessContext;
  governancePolicy?: GovernancePolicyConfig;
}): { primary: PrimaryRecommendation; recommendation: GovernanceRecommendation } {
  const supportingPoints: string[] = [];
  const policyThreshold =
    input.governancePolicy?.deploymentThresholds?.minReadinessScore ??
    Math.round(input.dna.riskThreshold * 100);
  const blockOnCritical = input.governancePolicy?.deploymentThresholds?.blockOnCritical ?? true;
  const requireProductionApproval =
    input.governancePolicy?.releaseRules?.requireApprovalForProduction ?? true;
  const qaLeadForHighRisk = input.governancePolicy?.approvalRequirements?.qaLeadForHighRisk ?? true;

  if (input.qa.readinessScore < policyThreshold) {
    supportingPoints.push(
      `QA readiness ${input.qa.readinessScore}/100 is below governance threshold (${policyThreshold})`,
    );
  }

  const firingCritical = input.grafana?.snapshot?.kpis.firingCritical ?? 0;
  if (firingCritical > 0) {
    supportingPoints.push(`${firingCritical} critical Grafana alert(s) firing`);
  }

  const metricsDegraded =
    input.metrics.synced &&
    input.metrics.snapshot &&
    (input.metrics.snapshot.kpis.healthScore < 50 || input.metrics.snapshot.kpis.errorRate > 1);

  if (metricsDegraded) {
    supportingPoints.push(
      `Metrics health ${input.metrics.snapshot!.kpis.healthScore}/100 with error rate ${input.metrics.snapshot!.kpis.errorRate}%`,
    );
  }

  const jiraHealth = input.jira?.health;
  const jiraHighGaps = jiraHealth?.gaps.filter((g) => g.priority === "high") ?? [];
  for (const gap of jiraHighGaps) {
    supportingPoints.push(`${gap.area}: ${gap.gap}`);
  }

  for (const gap of input.qa.testGaps.filter((g) => g.priority === "high")) {
    const line = `${gap.area}: ${gap.gap}`;
    if (!supportingPoints.includes(line)) supportingPoints.push(line);
  }

  if (
    input.codeAnalysis?.synced &&
    input.codeAnalysis.aiLinesPct != null &&
    input.codeAnalysis.reviewCoverageOnAiPrsPct != null &&
    input.codeAnalysis.aiLinesPct > 30 &&
    input.codeAnalysis.reviewCoverageOnAiPrsPct < 70
  ) {
    supportingPoints.push(
      `AI-assisted changes at ${input.codeAnalysis.aiLinesPct}% with only ${input.codeAnalysis.reviewCoverageOnAiPrsPct}% review coverage on AI PRs`,
    );
  }

  const shouldHold =
    input.qa.readinessScore < policyThreshold ||
    (blockOnCritical && firingCritical > 0) ||
    (input.environment === "PRODUCTION" && metricsDegraded);

  const shouldSignoff =
    !shouldHold &&
    (input.riskLevel === "HIGH" ||
      input.riskLevel === "CRITICAL" ||
      jiraHighGaps.length > 0 ||
      (input.environment === "PRODUCTION" && requireProductionApproval));

  if (shouldHold) {
    return {
      primary: "HOLD",
      recommendation: {
        title: `Hold ${input.releaseName} — resolve blockers before release`,
        description:
          supportingPoints.length > 0
            ? supportingPoints.map((p) => `• ${p}`).join("\n")
            : "Governance gate triggered — resolve blockers before release.",
        rationale:
          "Delivery DNA policy and live integration signals require a human-governed hold.",
        impact: "CRITICAL",
        confidence: 0.91,
        affectedSystems: ["release-pipeline", "qa", "observability"],
        requiredRole:
          firingCritical > 0 || metricsDegraded
            ? "DEVOPS_LEAD"
            : qaLeadForHighRisk &&
                (input.riskLevel === "HIGH" || input.riskLevel === "CRITICAL")
              ? "QA_LEAD"
              : "ENGINEERING_MANAGER",
      },
    };
  }

  if (shouldSignoff) {
    return {
      primary: "APPROVE_WITH_SIGNOFF",
      recommendation: {
        title: `Approve ${input.releaseName} with engineering manager sign-off`,
        description:
          supportingPoints.length > 0
            ? supportingPoints.map((p) => `• ${p}`).join("\n")
            : `Governance risk score ${input.governanceRiskScore}/100 maps to ${input.riskLevel} severity.`,
        rationale: "Elevated risk requires additional human sign-off before deployment.",
        impact: "HIGH",
        confidence: 0.87,
        affectedSystems: ["approvals", "deployment"],
        requiredRole: "ENGINEERING_MANAGER",
      },
    };
  }

  if (input.environment === "PRODUCTION") {
    supportingPoints.push(
      "Route deployment through Approval Center with audit trail before execution",
    );
  }

  return {
    primary: "APPROVE",
    recommendation: {
      title: `Approve ${input.releaseName} for deployment`,
      description:
        supportingPoints.length > 0
          ? supportingPoints.map((p) => `• ${p}`).join("\n")
          : "Telemetry and QA signals are within policy. Proceed with governed deployment.",
      rationale: `Readiness ${input.qa.readinessScore}/100, governance risk ${input.governanceRiskScore}/100.`,
      impact: "MEDIUM",
      confidence: 0.89,
      affectedSystems: ["deployment"],
      requiredRole: input.environment === "PRODUCTION" ? "DEVOPS_LEAD" : "QA_LEAD",
    },
  };
}

export function assessReleaseGovernance(input: {
  profile: OrganizationProfile | null;
  dna: DeliveryDNA;
  integrations: Integration[];
  releaseName: string;
  version?: string | null;
  environment: string;
  jira?: JiraAssessContext;
  grafana?: GrafanaAssessContext;
  prometheus?: PrometheusAssessContext;
  metrics?: MetricsAssessContext;
  github?: GitHubAssessContext;
  codeAnalysis?: CodeAnalysisAssessContext;
  governancePolicy?: GovernancePolicyConfig;
}): GovernanceAssessment {
  const metrics =
    input.metrics ?? resolveMetricsAssessContext({ integrations: input.integrations });
  const assessedAt = new Date().toISOString();

  const qa = assessQAIntelligence({
    profile: input.profile,
    dna: input.dna,
    integrations: input.integrations,
    releaseName: input.releaseName,
    environment: input.environment,
    jira: input.jira,
    grafana: input.grafana,
    prometheus: input.prometheus,
    metrics,
    github: input.github,
    codeAnalysis: input.codeAnalysis,
  });

  const connected = input.integrations.filter((i) => i.status === "CONNECTED").length;
  const envMultiplier =
    input.environment === "PRODUCTION" ? 1.25 : input.environment === "STAGING" ? 1 : 0.85;

  const governanceRiskScore = Math.min(
    100,
    Math.round(
      ((100 - qa.readinessScore) * 0.55 +
        (100 - input.dna.governanceScore) * 0.25 +
        Math.max(0, 3 - connected) * 8) *
        envMultiplier,
    ),
  );

  const riskLevel = riskLevelFromScore(governanceRiskScore);

  const grafanaCtx = input.grafana?.connected ? input.grafana : null;
  const prometheusCtx = input.prometheus?.connected ? input.prometheus : null;

  const telemetry: TelemetrySnapshot = {
    deployments24h: resolveDeployments24h(grafanaCtx ?? undefined),
    openIncidents: resolveOpenIncidents(
      grafanaCtx ?? undefined,
      metrics,
      prometheusCtx ?? undefined,
    ),
    errorRateDelta: formatErrorRateDelta(prometheusCtx, metrics),
    observabilityCoverage: formatObservabilityCoverage(grafanaCtx, prometheusCtx, metrics),
    metricsProvenance: metrics.synced ? metrics.provenance : null,
    assessedAt,
  };

  const { primary: primaryRecommendation, recommendation: primaryRec } = buildPrimaryDecision({
    releaseName: input.releaseName,
    environment: input.environment,
    dna: input.dna,
    qa,
    governanceRiskScore,
    riskLevel,
    jira: input.jira,
    grafana: input.grafana,
    metrics,
    codeAnalysis: input.codeAnalysis,
    governancePolicy: input.governancePolicy,
  });

  const recommendations: GovernanceRecommendation[] = [primaryRec];

  const summary = [
    `Release ${input.releaseName}${input.version ? ` (${input.version})` : ""} assessed for ${input.environment}.`,
    `Primary recommendation: ${primaryRecommendation.replace(/_/g, " ")}.`,
    `Governance risk: ${governanceRiskScore}/100 (${riskLevel}). QA readiness: ${qa.readinessScore}/100.`,
    qa.regressionNotes,
  ].join(" ");

  return {
    governanceRiskScore,
    riskLevel,
    primaryRecommendation,
    telemetry,
    qa,
    summary,
    recommendations,
  };
}
