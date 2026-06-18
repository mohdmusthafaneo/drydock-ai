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
