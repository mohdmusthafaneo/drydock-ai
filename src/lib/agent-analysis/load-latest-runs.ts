import { prisma } from "@/lib/prisma";
import type {
  AgentRunFreshness,
  LatestAgentAnalysisBundle,
  LatestDevOpsRunSummary,
  LatestGovernanceRunSummary,
  LatestProductivityRunSummary,
  LatestQaRunSummary,
} from "@/lib/agent-analysis/types";

const STALE_MS = 24 * 60 * 60 * 1000;

function isStale(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const ms = Date.now() - new Date(iso).getTime();
  return !Number.isNaN(ms) && ms > STALE_MS;
}

function freshnessRow(
  domain: AgentRunFreshness["domain"],
  label: string,
  analyzedAt: string | null,
  href: string,
): AgentRunFreshness {
  return {
    domain,
    label,
    analyzedAt,
    stale: isStale(analyzedAt),
    href,
  };
}

export async function loadLatestQaRun(
  organizationId: string,
): Promise<LatestQaRunSummary | null> {
  const run = await prisma.qAAnalysisRun.findFirst({
    where: { organizationId, status: "VERIFIED" },
    orderBy: { analyzedAt: "desc" },
    include: {
      projectKeys: { orderBy: { projectKey: "asc" } },
      issueEvidence: {
        orderBy: [{ preset: "asc" }, { issueKey: "asc" }],
        take: 80,
      },
    },
  });
  if (!run) return null;

  return {
    id: run.id,
    analyzedAt: run.analyzedAt.toISOString(),
    status: run.status,
    projectKeys: run.projectKeys.map((p) => p.projectKey),
    openBugs: run.headlineOpenBugsCount ?? 0,
    blocked: run.headlineBlockedCount ?? 0,
    open: run.headlineOpenCount ?? 0,
    done: run.headlineDoneCount ?? 0,
    evidenceCount: run.headlineIssueEvidenceCount ?? run.issueEvidence.length,
    evidence: run.issueEvidence.map((e) => ({
      preset: e.preset,
      issueKey: e.issueKey,
      summary: e.summary,
      status: e.status,
      issueType: e.issueType,
      priority: e.priority,
      assignee: e.assignee,
    })),
  };
}

export async function loadLatestDevOpsRun(
  organizationId: string,
): Promise<LatestDevOpsRunSummary | null> {
  const run = await prisma.devOpsAccountScanRun.findFirst({
    where: { organizationId, status: "VERIFIED" },
    orderBy: { analyzedAt: "desc" },
    include: {
      severityStats: true,
      resourceTypeStats: { orderBy: { count: "desc" } },
      hygieneFindings: {
        orderBy: [{ severity: "asc" }, { rank: "asc" }],
        take: 40,
      },
      warnings: { orderBy: { rank: "asc" } },
    },
  });
  if (!run) return null;

  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
  const bySeverity = [...run.severityStats].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  );

  const topFindings = [...run.hygieneFindings].sort((a, b) => {
    const sa = severityOrder.indexOf(a.severity);
    const sb = severityOrder.indexOf(b.severity);
    if (sa !== sb) return sa - sb;
    return a.rank - b.rank;
  });

  return {
    id: run.id,
    analyzedAt: run.analyzedAt.toISOString(),
    status: run.status,
    accountId: run.accountId,
    roleArn: run.roleArn,
    resourcesCount: run.headlineResourcesCount ?? 0,
    findingsCount: run.headlineFindingsCount ?? 0,
    warningsCount: run.headlineWarningsCount ?? 0,
    regionsCount: run.regionsCount,
    durationMs: run.durationMs,
    bySeverity: bySeverity.map((s) => ({ severity: s.severity, count: s.count })),
    byResourceType: run.resourceTypeStats.map((r) => ({
      resourceType: r.resourceType,
      count: r.count,
    })),
    topFindings: topFindings.slice(0, 25).map((f) => ({
      id: f.id,
      rank: f.rank,
      checkId: f.checkId,
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
      resourceType: f.resourceType,
      resourceRef: f.resourceRef,
    })),
    warnings: run.warnings.map((w) => w.warningText),
  };
}

export async function loadLatestGovernanceRun(
  organizationId: string,
): Promise<LatestGovernanceRunSummary | null> {
  const run = await prisma.governanceAnalysisRun.findFirst({
    where: { organizationId, status: "VERIFIED" },
    orderBy: { analyzedAt: "desc" },
    include: {
      worstFiles: { orderBy: { rank: "asc" }, take: 10 },
      riskDrivers: { orderBy: { rank: "asc" }, take: 8 },
      deadCodeFindings: { orderBy: { rank: "asc" }, take: 10 },
    },
  });
  if (!run) return null;

  return {
    id: run.id,
    analyzedAt: run.analyzedAt.toISOString(),
    status: run.status,
    repositoryName: run.repositoryName,
    revspec: run.revspec,
    riskScore: run.headlineRiskScore,
    probability: run.headlineProbability,
    riskLevel: run.headlineRiskLevel,
    reviewPriority: run.headlineReviewPriority,
    summary: run.headlineSummary,
    worstFilePath: run.headlineWorstFilePath,
    findingsCount: run.headlineFindingsCount ?? 0,
    deadCodeCount: run.headlineDeadCodeFindingsCount ?? 0,
    worstFiles: run.worstFiles.map((f) => ({
      rank: f.rank,
      filePath: f.filePath,
      score: f.score,
      maxCcn: f.maxCcn,
      hasTestFile: f.hasTestFile,
    })),
    riskDrivers: run.riskDrivers.map((d) => ({
      rank: d.rank,
      label: d.label,
      contribution: d.contribution,
    })),
    deadCode: run.deadCodeFindings.map((d) => ({
      rank: d.rank,
      kind: d.kind,
      filePath: d.filePath,
      reason: d.reason,
      cleanupReady: d.cleanupReady,
    })),
  };
}

export async function loadLatestProductivityRun(
  organizationId: string,
): Promise<LatestProductivityRunSummary | null> {
  const run = await prisma.productivityAnalysisRun.findFirst({
    where: { organizationId, status: "VERIFIED" },
    orderBy: { analyzedAt: "desc" },
    include: {
      contributors: { orderBy: { rank: "asc" }, take: 10 },
      weeklyVolume: { orderBy: { isoWeek: "asc" } },
      commitTypeBreakdown: { orderBy: { count: "desc" } },
    },
  });
  if (!run) return null;

  return {
    id: run.id,
    analyzedAt: run.analyzedAt.toISOString(),
    status: run.status,
    repositoryName: run.repositoryName,
    branch: run.branch,
    totalCommits: run.headlineTotalCommits,
    filesTouched: run.headlineFilesTouched,
    prsMerged: run.headlinePrsMerged,
    featFixRatio: run.headlineFeatFixRatio,
    tlDr: run.tlDr,
    strongestSignals: run.strongestSignals,
    weakestSignals: run.weakestSignals,
    contributors: run.contributors.map((c) => ({
      authorName: c.authorName,
      commits: c.commits,
      sharePct: c.sharePct,
      net: c.net,
      rank: c.rank,
    })),
    weeklyVolume: run.weeklyVolume.map((w) => ({
      isoWeek: w.isoWeek,
      commits: w.commits,
    })),
    commitTypes: run.commitTypeBreakdown.map((t) => ({
      commitType: t.commitType,
      count: t.count,
      sharePct: t.sharePct,
    })),
  };
}

export async function loadLatestAgentAnalysis(
  organizationId: string,
): Promise<LatestAgentAnalysisBundle> {
  const [qa, devops, governance, productivity] = await Promise.all([
    loadLatestQaRun(organizationId),
    loadLatestDevOpsRun(organizationId),
    loadLatestGovernanceRun(organizationId),
    loadLatestProductivityRun(organizationId),
  ]);

  return {
    qa,
    devops,
    governance,
    productivity,
    freshness: [
      freshnessRow("qa", "QA", qa?.analyzedAt ?? null, "/qa"),
      freshnessRow("devops", "Cloud hygiene", devops?.analyzedAt ?? null, "/devops"),
      freshnessRow(
        "governance",
        "Code risk",
        governance?.analyzedAt ?? null,
        "/code-health",
      ),
      freshnessRow(
        "productivity",
        "Productivity",
        productivity?.analyzedAt ?? null,
        "/productivity",
      ),
    ],
  };
}
