import type { DeliveryDNA, Integration, OrganizationProfile } from "@/generated/prisma/client";
import type { GitHubAssessContext } from "@/lib/github-assess-context";
import type { GrafanaAssessContext } from "@/lib/grafana-assess-context";
import type { JiraAssessContext } from "@/lib/jira-delivery-health";
import {
  formatErrorRateDelta,
  formatObservabilityCoverage,
  resolveMetricsAssessContext,
  type PrometheusAssessContext,
} from "@/lib/observability-connectivity";
import type { MetricsAssessContext, MetricsProvenance } from "@/lib/observability-metrics/types";
import type { QAAssessment } from "@/lib/qa-intelligence";
import { assessQAIntelligence } from "@/lib/qa-intelligence";

export type TelemetrySnapshot = {
  deployments24h: number;
  openIncidents: number;
  errorRateDelta: string;
  observabilityCoverage: string;
  metricsProvenance?: MetricsProvenance | null;
  assessedAt?: string;
};

export type GovernanceAssessment = {
  governanceRiskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  telemetry: TelemetrySnapshot;
  qa: QAAssessment;
  summary: string;
  recommendations: Array<{
    title: string;
    description: string;
    rationale: string;
    impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    confidence: number;
    affectedSystems: string[];
    requiredRole?: "QA_LEAD" | "DEVOPS_LEAD" | "ENGINEERING_MANAGER";
  }>;
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

  const recommendations: GovernanceAssessment["recommendations"] = [];

  if (qa.readinessScore < input.dna.riskThreshold * 100) {
    recommendations.push({
      title: `Block ${input.releaseName} until QA readiness improves`,
      description:
        `Readiness score ${qa.readinessScore} is below governance threshold (${Math.round(input.dna.riskThreshold * 100)}).`,
      rationale:
        "Delivery DNA policy requires human-governed gate when quality signals fail threshold.",
      impact: "CRITICAL",
      confidence: 0.91,
      affectedSystems: ["release-pipeline", "qa"],
      requiredRole: "QA_LEAD",
    });
  }

  if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
    recommendations.push({
      title: "Require engineering manager sign-off before deploy",
      description:
        "Elevated governance risk from telemetry correlation and QA gap analysis.",
      rationale: `Governance risk score ${governanceRiskScore} maps to ${riskLevel} severity.`,
      impact: "HIGH",
      confidence: 0.87,
      affectedSystems: ["approvals", "deployment"],
      requiredRole: "ENGINEERING_MANAGER",
    });
  }

  if (input.environment === "PRODUCTION") {
    recommendations.push({
      title: "Enable controlled production deployment window",
      description:
        "Route deployment through Approval Center with audit trail before execution.",
      rationale: "Production releases require human-governed execution per enterprise policy.",
      impact: "HIGH",
      confidence: 0.94,
      affectedSystems: ["deployment", "audit"],
      requiredRole: "DEVOPS_LEAD",
    });
  }

  const firingCritical = input.grafana?.snapshot?.kpis.firingCritical ?? 0;
  const metricsDegraded =
    metrics.synced &&
    metrics.snapshot &&
    (metrics.snapshot.kpis.healthScore < 50 || metrics.snapshot.kpis.errorRate > 1);

  if (firingCritical > 0 || metricsDegraded) {
    recommendations.push({
      title: "Resolve firing alerts before production release",
      description:
        firingCritical > 0
          ? `${firingCritical} critical Grafana alert(s) firing.`
          : `Metrics health ${metrics.snapshot!.kpis.healthScore}/100 with elevated error rate.`,
      rationale: "Operational degradation detected from live observability sync.",
      impact: "HIGH",
      confidence: 0.9,
      affectedSystems: ["observability", "deployment"],
      requiredRole: "DEVOPS_LEAD",
    });
  }

  const jiraHealth = input.jira?.health;
  if (jiraHealth && jiraHealth.gaps.some((g) => g.priority === "high")) {
    recommendations.push({
      title: "Resolve Jira delivery blockers before release",
      description: jiraHealth.gaps
        .filter((g) => g.priority === "high")
        .map((g) => `${g.area}: ${g.gap}`)
        .join("; "),
      rationale: `Jira delivery health score ${jiraHealth.score}/100 from sync at ${jiraHealth.snapshotSyncedAt}.`,
      impact: "HIGH",
      confidence: 0.88,
      affectedSystems: ["jira", "release-pipeline"],
      requiredRole: "QA_LEAD",
    });
  }

  if (qa.testGaps.length > 0) {
    recommendations.push({
      title: "Close test coverage gaps before release",
      description: qa.testGaps.map((g) => `${g.area}: ${g.gap}`).join("; "),
      rationale: "QA Intelligence Engine identified gaps that weaken release confidence.",
      impact: "MEDIUM",
      confidence: 0.84,
      affectedSystems: ["qa", "jira"],
      requiredRole: "QA_LEAD",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: `Approve ${input.releaseName} for deployment`,
      description:
        "Telemetry and QA signals are within policy. Proceed with governed deployment.",
      rationale:
        `Readiness ${qa.readinessScore}/100, governance risk ${governanceRiskScore}/100.`,
      impact: "MEDIUM",
      confidence: 0.89,
      affectedSystems: ["deployment"],
      requiredRole: "DEVOPS_LEAD",
    });
  }

  const summary = [
    `Release ${input.releaseName}${input.version ? ` (${input.version})` : ""} assessed for ${input.environment}.`,
    `Governance risk: ${governanceRiskScore}/100 (${riskLevel}). QA readiness: ${qa.readinessScore}/100.`,
    qa.regressionNotes,
  ].join(" ");

  return {
    governanceRiskScore,
    riskLevel,
    telemetry,
    qa,
    summary,
    recommendations,
  };
}
