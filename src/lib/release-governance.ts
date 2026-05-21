import type { DeliveryDNA, Integration, OrganizationProfile } from "@/generated/prisma/client";
import type { QAAssessment } from "@/lib/qa-intelligence";
import { assessQAIntelligence } from "@/lib/qa-intelligence";

export type TelemetrySnapshot = {
  deployments24h: number;
  openIncidents: number;
  errorRateDelta: string;
  observabilityCoverage: string;
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

export function assessReleaseGovernance(input: {
  profile: OrganizationProfile | null;
  dna: DeliveryDNA;
  integrations: Integration[];
  releaseName: string;
  version?: string | null;
  environment: string;
}): GovernanceAssessment {
  const qa = assessQAIntelligence({
    profile: input.profile,
    dna: input.dna,
    integrations: input.integrations,
    releaseName: input.releaseName,
    environment: input.environment,
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

  const telemetry: TelemetrySnapshot = {
    deployments24h: connected > 0 ? 3 : 0,
    openIncidents: riskLevel === "CRITICAL" || riskLevel === "HIGH" ? 1 : 0,
    errorRateDelta: connected > 0 ? "+0.3%" : "unknown",
    observabilityCoverage:
      connected > 0 ? "Partial — Grafana/Prometheus stub" : "Not connected",
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
