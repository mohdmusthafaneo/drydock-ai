export type AiAttribution = "human_only" | "ai_assisted" | "ai_generated" | "unknown";

export type TimeRange = "7d" | "30d" | "90d";

export type TrendMetric = "lines" | "commits" | "prs";

export type CodeAnalysisKpis = {
  aiLinesPct: number;
  aiLinesPctDelta: number;
  aiCommitsPct: number;
  aiCommitsPctDelta: number;
  aiPrsPct: number;
  aiPrsPctDelta: number;
  reviewCoverageOnAiPrsPct: number;
};

export type CodeAnalysisPullRequestFile = {
  path: string;
  additions: number;
  deletions: number;
};

export type CodeAnalysisPullRequest = {
  id: string;
  number: number;
  title: string;
  repo: string;
  author: string;
  mergedAt: string;
  url: string;
  linesAdded: number;
  linesRemoved: number;
  attribution: AiAttribution;
  confidence: number;
  reviewCount: number;
  reviewers: string[];
  files?: CodeAnalysisPullRequestFile[];
  tools: string[];
  jiraKeys: string[];
  diffExcerpt?: string;
  completionScore?: number | null;
  completionRationale?: string | null;
  riskScore?: number | null;
  riskLevel?: "low" | "medium" | "high" | null;
  qualityFlags?: string[];
};

export type CodeAnalysisCommit = {
  sha: string;
  message: string;
  repo: string;
  author: string;
  committedAt: string;
  url: string;
  additions: number;
  deletions: number;
  attribution: AiAttribution;
  confidence: number;
  signals: string[];
  branch?: string;
  jiraKeys: string[];
  completionScore?: number | null;
  completionRationale?: string | null;
};

export type CodeAnalysisFile = {
  path: string;
  repo: string;
  changeCount: number;
  aiLinesPct: number;
  topContributors: string[];
  reviewers: string[];
  maintenanceCost: number;
};

export type CodeAnalysisTool = {
  name: string;
  linesAttributed: number;
  commitsAttributed: number;
  prsAttributed: number;
};

export type GovernanceSignal = {
  id: string;
  severity: "info" | "warning" | "error";
  title: string;
  description: string;
  entityLabel: string;
  entityUrl?: string;
  repo: string;
};

export type TrendBucket = {
  bucket: string;
  human_only: number;
  ai_assisted: number;
  ai_generated: number;
  commits?: number;
  prs?: number;
};

export type StoredCodeAnalysis = {
  syncedAt: string;
  repos: string[];
  pullRequests: CodeAnalysisPullRequest[];
  commits: CodeAnalysisCommit[];
};

export type CodeAnalysisAiRisk = {
  aiLinesPct: number;
  highRiskCount: number;
  unreviewedAiPrs: number;
  unlinkedAiPrs: number;
  avgCompletionScore: number | null;
};

export type CodeAnalysisAccountability = {
  highRiskPrsWithoutReviewer: number;
  unownedHighCostPaths: number;
  unnamedReviewerAiPrs: number;
};

export type CodeAnalysisSnapshot = {
  generatedAt: string;
  rangeLabel: string;
  repos: string[];
  kpis: CodeAnalysisKpis;
  attribution: Record<AiAttribution, { count: number; lines: number }>;
  trend: TrendBucket[];
  byRepo: { repo: string; aiLinesPct: number; totalLines: number }[];
  byAuthor: { login: string; aiLinesPct: number; commits: number }[];
  pullRequests: CodeAnalysisPullRequest[];
  commits: CodeAnalysisCommit[];
  files: CodeAnalysisFile[];
  tools: CodeAnalysisTool[];
  governanceSignals: GovernanceSignal[];
  aiRisk: CodeAnalysisAiRisk;
  accountability: CodeAnalysisAccountability;
};

export type CodeAnalysisFilters = {
  repos: string[];
  branch: "default" | "all";
  range: TimeRange;
  author: string | null;
};

export const ATTRIBUTION_LABELS: Record<AiAttribution, string> = {
  human_only: "Human only",
  ai_assisted: "AI-assisted",
  ai_generated: "Fully AI-generated",
  unknown: "Unknown",
};

export const ATTRIBUTION_COLORS: Record<AiAttribution, string> = {
  human_only: "var(--color-graphite)",
  ai_assisted: "var(--color-chart-blue)",
  ai_generated: "var(--color-rust)",
  unknown: "var(--color-dove)",
};
