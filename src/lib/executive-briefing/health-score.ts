import type {
  DeliveryHealthScore,
  HealthBand,
  HealthDimension,
  HealthDimensionId,
} from "@/lib/executive-briefing/types";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
import type { CodeAnalysisSnapshot } from "@/lib/code-analysis/types";
import type { PortfolioHygieneSummary } from "@/lib/jira-hygiene";

export type HealthScoreInput = {
  stats: {
    releaseReadiness: number;
    openIncidents: number;
    degradedDeployments: number;
    errorRate: number | null;
    p95Latency: number | null;
    pendingApprovals: number;
    rollbackPending: number;
    connectedTools: number;
    integrationsHealthy: number;
  };
  latestRelease?: {
    id: string;
    name: string;
    status: string;
    readinessScore: number | null;
    governanceRiskScore: number | null;
    assessedAt: Date | null;
    assessmentSummary?: string | null;
  } | null;
  deliverySnapshot?: DeliveryAnalysisSnapshot | null;
  codeSnapshot?: CodeAnalysisSnapshot | null;
  observabilitySnapshot?: ObservabilityAnalysisSnapshot | null;
  observabilityIsDemo?: boolean;
  hasAssessedRelease: boolean;
  jiraHygiene?: PortfolioHygieneSummary | null;
};

const DIMENSION_WEIGHTS: Record<HealthDimensionId, number> = {
  release: 0.35,
  momentum: 0.2,
  stability: 0.3,
  governance: 0.15,
};

const BAND_LABELS: Record<HealthBand, string> = {
  strong: "Strong",
  steady: "Steady",
  caution: "Caution",
  at_risk: "At risk",
};

export function scoreToBand(score: number): HealthBand {
  if (score >= 80) return "strong";
  if (score >= 60) return "steady";
  if (score >= 40) return "caution";
  return "at_risk";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeReleaseDimension(input: HealthScoreInput): HealthDimension | null {
  const { latestRelease, stats, hasAssessedRelease } = input;
  if (!hasAssessedRelease && !latestRelease && stats.releaseReadiness <= 0) {
    return null;
  }

  let score = stats.releaseReadiness;
  if (latestRelease?.readinessScore != null) {
    score = Math.round((score + latestRelease.readinessScore) / 2);
  }
  if (latestRelease?.governanceRiskScore != null) {
    const riskPenalty = Math.round(latestRelease.governanceRiskScore * 0.35);
    score = clampScore(score - riskPenalty);
  }
  if (latestRelease?.status === "BLOCKED") {
    score = clampScore(score - 25);
  } else if (latestRelease?.status === "STAGED" || latestRelease?.status === "READY") {
    score = clampScore(score + 5);
  }

  const readinessLabel =
    latestRelease?.readinessScore != null
      ? `QA readiness is at ${Math.round(latestRelease.readinessScore)}%`
      : `portfolio readiness is at ${stats.releaseReadiness}%`;

  const releaseName = latestRelease?.name ?? "the active release";
  return {
    id: "release",
    label: "Release confidence",
    score: clampScore(score),
    weight: DIMENSION_WEIGHTS.release,
    summary: `${releaseName}: ${readinessLabel}.`,
  };
}

function computeStabilityDimension(input: HealthScoreInput): HealthDimension | null {
  const { stats, observabilitySnapshot, observabilityIsDemo } = input;

  const hasObservability =
    observabilitySnapshot && !observabilityIsDemo && observabilitySnapshot.kpis;
  const hasTelemetrySignals =
    stats.openIncidents > 0 ||
    stats.degradedDeployments > 0 ||
    stats.errorRate != null ||
    stats.p95Latency != null ||
    hasObservability;

  if (!hasTelemetrySignals) return null;

  let score = 85;

  if (stats.openIncidents > 0) {
    score -= Math.min(40, stats.openIncidents * 15);
  }
  if (stats.degradedDeployments > 0) {
    score -= Math.min(25, stats.degradedDeployments * 12);
  }
  if (stats.errorRate != null) {
    if (stats.errorRate > 2) score -= 20;
    else if (stats.errorRate > 1) score -= 10;
    else if (stats.errorRate > 0.5) score -= 5;
  }
  if (stats.p95Latency != null) {
    if (stats.p95Latency > 500) score -= 15;
    else if (stats.p95Latency > 300) score -= 8;
  }
  if (hasObservability && observabilitySnapshot) {
    const obsScore = observabilitySnapshot.kpis.healthScore;
    score = Math.round(score * 0.5 + obsScore * 0.5);
    const { critical } = observabilitySnapshot.healthMix;
    if (critical > 0) score -= critical * 8;
  }

  const incidentLine =
    stats.openIncidents === 0
      ? "Production is stable with no open incidents"
      : `${stats.openIncidents} open incident${stats.openIncidents === 1 ? "" : "s"} affecting stability`;

  return {
    id: "stability",
    label: "Operational stability",
    score: clampScore(score),
    weight: DIMENSION_WEIGHTS.stability,
    summary: incidentLine + ".",
  };
}

function computeMomentumDimension(input: HealthScoreInput): HealthDimension | null {
  const { deliverySnapshot, jiraHygiene } = input;
  if (!deliverySnapshot?.kpis) return null;

  const { healthScore, blocked, overdue, sprintCompletionPct, resolvedLast7d } =
    deliverySnapshot.kpis;

  let score = healthScore;
  if (blocked > 0) score -= Math.min(20, blocked * 4);
  if (overdue > 0) score -= Math.min(15, overdue * 3);
  if (sprintCompletionPct != null && sprintCompletionPct < 50) {
    score -= 10;
  }

  if (jiraHygiene?.degradesTrust) {
    score = Math.min(score, 70);
  }

  const resolvedLine =
    resolvedLast7d != null && resolvedLast7d > 0
      ? `${resolvedLast7d} tickets closed in the last seven days`
      : `${deliverySnapshot.kpis.openWork} open work items in Jira`;

  const blockerLine =
    blocked > 0 ? `; ${blocked} blocked` : overdue > 0 ? `; ${overdue} overdue` : "";

  const hygieneNote = jiraHygiene?.degradesTrust ? "; Jira data may be unreliable" : "";

  return {
    id: "momentum",
    label: "Delivery momentum",
    score: clampScore(score),
    weight: DIMENSION_WEIGHTS.momentum,
    summary: `${resolvedLine}${blockerLine}${hygieneNote}.`,
  };
}

function computeGovernanceDimension(input: HealthScoreInput): HealthDimension | null {
  const { stats, jiraHygiene } = input;

  let score = 90;
  if (stats.pendingApprovals > 0) score -= Math.min(30, stats.pendingApprovals * 12);
  if (stats.rollbackPending > 0) score -= Math.min(25, stats.rollbackPending * 15);

  const integrationRatio =
    stats.connectedTools > 0 ? stats.integrationsHealthy / stats.connectedTools : 0;
  if (stats.connectedTools === 0) {
    score -= 35;
  } else if (integrationRatio < 1) {
    score -= Math.round((1 - integrationRatio) * 20);
  }

  if (jiraHygiene?.degradesTrust) {
    const hygienePenalty = jiraHygiene.portfolioScore < 40 ? 25 : 15;
    score -= hygienePenalty;
  }

  const approvalLine =
    stats.pendingApprovals > 0
      ? `${stats.pendingApprovals} approval${stats.pendingApprovals === 1 ? "" : "s"} waiting for a decision`
      : "No pending release approvals";

  const hygieneLine = jiraHygiene?.degradesTrust
    ? `; Jira board hygiene is below threshold (${jiraHygiene.portfolioScore}/100)`
    : "";

  return {
    id: "governance",
    label: "Governance & data trust",
    score: clampScore(score),
    weight: DIMENSION_WEIGHTS.governance,
    summary: `${approvalLine}; ${stats.integrationsHealthy} of ${Math.max(stats.connectedTools, 1)} integrations healthy${hygieneLine}.`,
  };
}

/**
 * Composite delivery health score. Missing release data caps overall at 79.
 * Dimensions without data have weight redistributed to available dimensions.
 */
export function computeDeliveryHealthScore(input: HealthScoreInput): DeliveryHealthScore {
  const dataGaps: string[] = [];
  const computedAt = new Date().toISOString();

  const candidates = [
    computeReleaseDimension(input),
    computeStabilityDimension(input),
    computeMomentumDimension(input),
    computeGovernanceDimension(input),
  ];

  if (!input.deliverySnapshot) dataGaps.push("Jira not connected");
  if (!input.codeSnapshot) dataGaps.push("GitHub activity not synced");
  if (!input.observabilitySnapshot || input.observabilityIsDemo) {
    dataGaps.push("Observability metrics not available");
  }
  if (!input.hasAssessedRelease && !input.latestRelease) {
    dataGaps.push("No assessed release");
  }

  const dimensions = candidates.filter((d): d is HealthDimension => d !== null);

  const hasScoreableRelease = dimensions.some((d) => d.id === "release");
  const hasAnyIntegrationData =
    Boolean(input.deliverySnapshot) ||
    Boolean(input.codeSnapshot) ||
    Boolean(input.observabilitySnapshot && !input.observabilityIsDemo) ||
    input.hasAssessedRelease;

  if (!hasAnyIntegrationData && !input.hasAssessedRelease) {
    return {
      overall: null,
      band: null,
      bandLabel: null,
      dimensions: [],
      computedAt,
      dataGaps,
      visible: false,
    };
  }

  if (dimensions.length === 0) {
    return {
      overall: null,
      band: null,
      bandLabel: null,
      dimensions: [],
      computedAt,
      dataGaps,
      visible: false,
    };
  }

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const weightedSum = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
  let overall = clampScore(weightedSum / totalWeight);

  if (!hasScoreableRelease) {
    overall = Math.min(overall, 79);
    if (!dataGaps.includes("No assessed release")) {
      dataGaps.push("Release confidence unavailable — score capped");
    }
  }

  const band = scoreToBand(overall);

  return {
    overall,
    band,
    bandLabel: BAND_LABELS[band],
    dimensions,
    computedAt,
    dataGaps,
    visible: true,
  };
}
