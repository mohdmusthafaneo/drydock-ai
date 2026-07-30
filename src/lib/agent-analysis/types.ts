export type AgentAnalysisDomain = "qa" | "devops" | "governance" | "productivity";

export type AgentRunFreshness = {
  domain: AgentAnalysisDomain;
  label: string;
  analyzedAt: string | null;
  stale: boolean;
  href: string;
};

export type LatestQaRunSummary = {
  id: string;
  analyzedAt: string;
  status: string;
  projectKeys: string[];
  openBugs: number;
  blocked: number;
  open: number;
  done: number;
  evidenceCount: number;
  evidence: Array<{
    preset: string;
    issueKey: string;
    summary: string;
    status: string;
    issueType: string;
    priority: string | null;
    assignee: string | null;
  }>;
};

export type LatestDevOpsRunSummary = {
  id: string;
  analyzedAt: string;
  status: string;
  accountId: string;
  roleArn: string;
  resourcesCount: number;
  findingsCount: number;
  warningsCount: number;
  regionsCount: number | null;
  durationMs: number | null;
  bySeverity: Array<{ severity: string; count: number }>;
  byResourceType: Array<{ resourceType: string; count: number }>;
  topFindings: Array<{
    id: string;
    rank: number;
    checkId: string;
    severity: string;
    title: string;
    description: string;
    recommendation: string;
    resourceType: string | null;
    resourceRef: string | null;
  }>;
  warnings: string[];
};

export type LatestGovernanceRunSummary = {
  id: string;
  analyzedAt: string;
  status: string;
  repositoryName: string;
  revspec: string;
  riskScore: number | null;
  probability: number | null;
  riskLevel: string | null;
  reviewPriority: string | null;
  summary: string | null;
  worstFilePath: string | null;
  findingsCount: number;
  deadCodeCount: number;
  worstFiles: Array<{
    rank: number;
    filePath: string;
    score: number | null;
    maxCcn: number | null;
    hasTestFile: boolean | null;
  }>;
  riskDrivers: Array<{
    rank: number;
    label: string | null;
    contribution: number | null;
  }>;
  deadCode: Array<{
    rank: number;
    kind: string | null;
    filePath: string | null;
    reason: string | null;
    cleanupReady: boolean | null;
  }>;
};

export type LatestProductivityRunSummary = {
  id: string;
  analyzedAt: string;
  status: string;
  repositoryName: string;
  branch: string;
  totalCommits: number | null;
  filesTouched: number | null;
  prsMerged: number | null;
  featFixRatio: number | null;
  tlDr: string;
  strongestSignals: string[];
  weakestSignals: string[];
  contributors: Array<{
    authorName: string;
    commits: number;
    sharePct: number;
    net: number;
    rank: number | null;
  }>;
  weeklyVolume: Array<{ isoWeek: string; commits: number }>;
  commitTypes: Array<{ commitType: string; count: number; sharePct: number }>;
};

export type LatestAgentAnalysisBundle = {
  qa: LatestQaRunSummary | null;
  devops: LatestDevOpsRunSummary | null;
  governance: LatestGovernanceRunSummary | null;
  productivity: LatestProductivityRunSummary | null;
  freshness: AgentRunFreshness[];
};
