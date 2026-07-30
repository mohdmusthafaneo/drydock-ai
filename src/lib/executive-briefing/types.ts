export type HealthDimensionId =
  | "release"
  | "stability"
  | "momentum"
  | "engineering"
  | "governance";

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

export type BriefingClaimVerdict = "good" | "attention" | "risk" | "neutral";

export type BriefingClaim = {
  id: string;
  headline: string;
  /** Large figure — readiness %, incident count, etc. */
  metric?: string;
  /** What the figure measures, e.g. "Ready to ship" */
  metricLabel?: string;
  /** Plain-English status the user can act on */
  verdict: BriefingClaimVerdict;
  verdictLabel: string;
  /** One supporting sentence — no bullet lists */
  context: string;
  href?: string;
};

/** Inline segment for the L1 natural-language headline (emphasis = key numbers/names). */
export type HeadlineSegment =
  | { kind: "text"; text: string }
  | { kind: "emphasis"; text: string };

export type BriefingHighlight = {
  id: string;
  label: string;
  value: string;
  subtext?: string;
  href?: string;
  tone?: "neutral" | "good" | "attention" | "risk";
};

export type BriefingInsight = {
  message: string;
  tone: "info" | "attention" | "critical";
  href?: string;
};

export type ExecutiveBriefing = {
  /** Short, scannable headline with inline emphasis on key figures. */
  headline: HeadlineSegment[];
  /** One-line metadata (freshness, sources) — kept out of the headline. */
  meta: string;
  /** Optional plain-English callout when something needs attention. */
  insight?: BriefingInsight;
  /** Top KPIs shown as large figures beside the headline. */
  highlights: BriefingHighlight[];
  /** Flattened headline text for search, tests, and legacy consumers. */
  narrative: string;
  wordCount: number;
  health: DeliveryHealthScore;
  claims: BriefingClaim[];
  freshness: {
    asOf: string;
    stale: boolean;
    staleSources: string[];
  };
  source: "deterministic" | "llm_enriched";
  /** When source is llm_enriched — ISO timestamp of the LLM snapshot. */
  llmGeneratedAt?: string | null;
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
    qaSignalsJson: unknown;
    testGapsJson: unknown;
    telemetryJson: unknown;
    postDeployComparisonJson: unknown;
    assessedAt: string | null;
    pendingApprovalCount: number;
    pendingApprovalRoles: string[];
    staleData: boolean;
  } | null;
};
