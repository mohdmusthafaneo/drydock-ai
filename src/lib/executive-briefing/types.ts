export type HealthDimensionId = "release" | "stability" | "momentum" | "governance";

export type HealthDimension = {
  id: HealthDimensionId;
  label: string;
  score: number;
  weight: number;
  summary: string;
};

export type HealthBand = "strong" | "steady" | "caution" | "at_risk";

export type DeliveryHealthScore = {
  overall: number | null;
  band: HealthBand | null;
  bandLabel: string | null;
  dimensions: HealthDimension[];
  computedAt: string;
  dataGaps: string[];
  /** When false, L1 should not show a numeric gauge (onboarding / insufficient data). */
  visible: boolean;
};

export type BriefingClaim = {
  id: string;
  headline: string;
  facts: string[];
  href?: string;
  severity?: "info" | "warning" | "critical";
};

export type ExecutiveBriefing = {
  narrative: string;
  wordCount: number;
  health: DeliveryHealthScore;
  claims: BriefingClaim[];
  primaryCta?: { label: string; href: string };
  freshness: {
    asOf: string;
    stale: boolean;
    staleSources: string[];
  };
  source: "deterministic" | "llm_enriched";
};

export type BriefingCharts = {
  delivery: {
    riskMix: {
      blocked: number;
      overdue: number;
      bugs: number;
      otherOpen: number;
    };
  } | null;
  engineering: {
    byAuthor: { login: string; aiLinesPct: number; commits: number }[];
  } | null;
  stability: {
    openAlerts: number;
    healthScore: number;
  } | null;
  release: {
    releaseId: string;
    releaseName: string;
    version?: string | null;
    environment: string;
    readinessScore: number | null;
    governanceRiskScore: number | null;
    riskLevel: string | null;
    primaryRecommendation: string | null;
    assessmentSummary?: string | null;
    qaSignalsJson: string;
    testGapsJson: string;
    telemetryJson: string;
    postDeployComparisonJson: string | null;
    assessedAt: string | null;
    pendingApprovalCount: number;
    pendingApprovalRoles: string[];
    staleData: boolean;
  } | null;
};
