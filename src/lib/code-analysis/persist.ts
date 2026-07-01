import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CodeAnalysisCommit,
  CodeAnalysisPullRequest,
  StoredCodeAnalysis,
} from "@/lib/code-analysis/types";

const HISTORY_WINDOW_DAYS = 90;

function isMissingCodeAnalysisTables(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" ||
      error.message.includes("CodeAnalysisCommit") ||
      error.message.includes("CodeAnalysisPullRequest") ||
      error.message.includes("CodeAnalysisRun"))
  );
}

function sinceDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function parseStringArrayJson(json: string): string[] {
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

function parseFilesJson(json: string): CodeAnalysisPullRequest["files"] {
  try {
    return JSON.parse(json) as NonNullable<CodeAnalysisPullRequest["files"]>;
  } catch {
    return [];
  }
}

function rowToCommit(row: {
  sha: string;
  message: string;
  repo: string;
  author: string;
  committedAt: Date;
  url: string;
  additions: number;
  deletions: number;
  attribution: string;
  confidence: number;
  signalsJson: string;
  jiraKeysJson: string;
  branch: string | null;
  completionScore: number | null;
  completionRationale: string | null;
}): CodeAnalysisCommit {
  return {
    sha: row.sha,
    message: row.message,
    repo: row.repo,
    author: row.author,
    committedAt: row.committedAt.toISOString(),
    url: row.url,
    additions: row.additions,
    deletions: row.deletions,
    attribution: row.attribution as CodeAnalysisCommit["attribution"],
    confidence: row.confidence,
    signals: parseStringArrayJson(row.signalsJson),
    jiraKeys: parseStringArrayJson(row.jiraKeysJson),
    branch: row.branch ?? undefined,
    completionScore: row.completionScore,
    completionRationale: row.completionRationale,
  };
}

function rowToPullRequest(row: {
  externalId: string;
  number: number;
  title: string;
  repo: string;
  author: string;
  mergedAt: Date;
  url: string;
  linesAdded: number;
  linesRemoved: number;
  attribution: string;
  confidence: number;
  reviewCount: number;
  reviewersJson: string;
  filesJson: string;
  toolsJson: string;
  jiraKeysJson: string;
  diffExcerpt: string | null;
  completionScore: number | null;
  completionRationale: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  qualityFlagsJson: string;
}): CodeAnalysisPullRequest {
  return {
    id: row.externalId,
    number: row.number,
    title: row.title,
    repo: row.repo,
    author: row.author,
    mergedAt: row.mergedAt.toISOString(),
    url: row.url,
    linesAdded: row.linesAdded,
    linesRemoved: row.linesRemoved,
    attribution: row.attribution as CodeAnalysisPullRequest["attribution"],
    confidence: row.confidence,
    reviewCount: row.reviewCount,
    reviewers: parseStringArrayJson(row.reviewersJson),
    files: parseFilesJson(row.filesJson),
    tools: parseStringArrayJson(row.toolsJson),
    jiraKeys: parseStringArrayJson(row.jiraKeysJson),
    diffExcerpt: row.diffExcerpt ?? undefined,
    completionScore: row.completionScore,
    completionRationale: row.completionRationale,
    riskScore: row.riskScore,
    riskLevel: row.riskLevel as CodeAnalysisPullRequest["riskLevel"],
    qualityFlags: parseStringArrayJson(row.qualityFlagsJson),
  };
}

export async function loadStoredCodeAnalysisFromDb(
  organizationId: string,
): Promise<StoredCodeAnalysis | null> {
  try {
    return await loadStoredCodeAnalysisFromDbInner(organizationId);
  } catch (error) {
    if (isMissingCodeAnalysisTables(error)) return null;
    throw error;
  }
}

async function loadStoredCodeAnalysisFromDbInner(
  organizationId: string,
): Promise<StoredCodeAnalysis | null> {
  const since = sinceDate(HISTORY_WINDOW_DAYS);

  const [latestRun, commits, pullRequests] = await Promise.all([
    prisma.codeAnalysisRun.findFirst({
      where: { organizationId },
      orderBy: { syncedAt: "desc" },
    }),
    prisma.codeAnalysisCommit.findMany({
      where: { organizationId, committedAt: { gte: since } },
      orderBy: { committedAt: "desc" },
    }),
    prisma.codeAnalysisPullRequest.findMany({
      where: { organizationId, mergedAt: { gte: since } },
      orderBy: { mergedAt: "desc" },
    }),
  ]);

  if (!latestRun && commits.length === 0 && pullRequests.length === 0) {
    return null;
  }

  let repos: string[] = [];
  if (latestRun) {
    try {
      repos = JSON.parse(latestRun.repoFullNamesJson) as string[];
    } catch {
      repos = [];
    }
  }

  if (repos.length === 0) {
    repos = [
      ...new Set([
        ...commits.map((c) => c.repo),
        ...pullRequests.map((p) => p.repo),
      ]),
    ];
  }

  return {
    syncedAt: (latestRun?.syncedAt ?? new Date()).toISOString(),
    repos,
    commits: commits.map(rowToCommit),
    pullRequests: pullRequests.map(rowToPullRequest),
  };
}

export async function persistCodeAnalysisToDb(input: {
  organizationId: string;
  integrationId: string;
  repos: string[];
  commits: CodeAnalysisCommit[];
  pullRequests: CodeAnalysisPullRequest[];
  summary: string;
  syncedAt: Date;
}): Promise<void> {
  try {
    await persistCodeAnalysisToDbInner(input);
  } catch (error) {
    if (isMissingCodeAnalysisTables(error)) return;
    throw error;
  }
}

async function persistCodeAnalysisToDbInner(input: {
  organizationId: string;
  integrationId: string;
  repos: string[];
  commits: CodeAnalysisCommit[];
  pullRequests: CodeAnalysisPullRequest[];
  summary: string;
  syncedAt: Date;
}): Promise<void> {
  const now = input.syncedAt;

  await prisma.$transaction(async (tx) => {
    await tx.codeAnalysisRun.create({
      data: {
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        repoFullNamesJson: JSON.stringify(input.repos),
        commitCount: input.commits.length,
        prCount: input.pullRequests.length,
        summary: input.summary,
        syncedAt: now,
      },
    });

    for (const c of input.commits) {
      await tx.codeAnalysisCommit.upsert({
        where: {
          organizationId_repo_sha: {
            organizationId: input.organizationId,
            repo: c.repo,
            sha: c.sha,
          },
        },
        create: {
          organizationId: input.organizationId,
          sha: c.sha,
          repo: c.repo,
          message: c.message,
          author: c.author,
          committedAt: new Date(c.committedAt),
          url: c.url,
          additions: c.additions,
          deletions: c.deletions,
          attribution: c.attribution,
          confidence: c.confidence,
          signalsJson: JSON.stringify(c.signals),
          jiraKeysJson: JSON.stringify(c.jiraKeys ?? []),
          branch: c.branch ?? null,
          lastSeenAt: now,
        },
        update: {
          message: c.message,
          author: c.author,
          committedAt: new Date(c.committedAt),
          url: c.url,
          additions: c.additions,
          deletions: c.deletions,
          attribution: c.attribution,
          confidence: c.confidence,
          signalsJson: JSON.stringify(c.signals),
          jiraKeysJson: JSON.stringify(c.jiraKeys ?? []),
          branch: c.branch ?? null,
          completionScore: null,
          completionRationale: null,
          lastSeenAt: now,
        },
      });
    }

    for (const pr of input.pullRequests) {
      await tx.codeAnalysisPullRequest.upsert({
        where: {
          organizationId_externalId: {
            organizationId: input.organizationId,
            externalId: pr.id,
          },
        },
        create: {
          organizationId: input.organizationId,
          externalId: pr.id,
          number: pr.number,
          title: pr.title,
          repo: pr.repo,
          author: pr.author,
          mergedAt: new Date(pr.mergedAt),
          url: pr.url,
          linesAdded: pr.linesAdded,
          linesRemoved: pr.linesRemoved,
          attribution: pr.attribution,
          confidence: pr.confidence,
          reviewCount: pr.reviewCount,
          reviewersJson: JSON.stringify(pr.reviewers ?? []),
          filesJson: JSON.stringify(pr.files ?? []),
          toolsJson: JSON.stringify(pr.tools),
          jiraKeysJson: JSON.stringify(pr.jiraKeys ?? []),
          diffExcerpt: pr.diffExcerpt ?? null,
          lastSeenAt: now,
        },
        update: {
          title: pr.title,
          author: pr.author,
          mergedAt: new Date(pr.mergedAt),
          url: pr.url,
          linesAdded: pr.linesAdded,
          linesRemoved: pr.linesRemoved,
          attribution: pr.attribution,
          confidence: pr.confidence,
          reviewCount: pr.reviewCount,
          reviewersJson: JSON.stringify(pr.reviewers ?? []),
          filesJson: JSON.stringify(pr.files ?? []),
          toolsJson: JSON.stringify(pr.tools),
          jiraKeysJson: JSON.stringify(pr.jiraKeys ?? []),
          diffExcerpt: pr.diffExcerpt ?? null,
          completionScore: null,
          completionRationale: null,
          riskScore: null,
          riskLevel: null,
          qualityFlagsJson: "[]",
          lastSeenAt: now,
        },
      });
    }
  });
}
