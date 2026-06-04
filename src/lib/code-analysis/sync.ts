import { prisma } from "@/lib/prisma";
import { markIntegrationSync } from "@/lib/integration-health";
import {
  getCommit,
  getPullRequestFiles,
  getRepo,
  GitHubApiError,
  listClosedPulls,
  listCommits,
  listInstallationRepos,
  listPullRequestReviews,
  parseOwnerRepo,
} from "@/lib/github-api";
import { resolveSyncRepoFullNames, MAX_GITHUB_SYNC_REPOS } from "@/lib/github-repo-selection";
import { resolveGitHubTokenForIntegration } from "@/lib/github-token";
import {
  mergeGitHubMeta,
  parseIntegrationMeta,
  type GitHubIntegrationMeta,
} from "@/lib/integration-meta";
import { classifyCommit, classifyPullRequest } from "@/lib/code-analysis/classifier";
import { snapshotForStoredData } from "@/lib/code-analysis/compute-snapshot";
import {
  loadStoredCodeAnalysisFromDb,
  persistCodeAnalysisToDb,
} from "@/lib/code-analysis/persist";
import type {
  CodeAnalysisCommit,
  CodeAnalysisFilters,
  CodeAnalysisPullRequest,
  CodeAnalysisSnapshot,
  StoredCodeAnalysis,
} from "@/lib/code-analysis/types";

const FETCH_WINDOW_DAYS = 90;
const MAX_COMMITS_PER_REPO = 50;
const MAX_PRS_PER_REPO = 25;

export function getStoredCodeAnalysisSnapshot(
  metadataJson: string,
): StoredCodeAnalysis | null {
  const meta = parseIntegrationMeta(metadataJson);
  if (!meta.codeAnalysisSnapshot) return null;
  return meta.codeAnalysisSnapshot;
}

/** Prefer Prisma history (90d); fall back to integration metadata snapshot. */
export async function resolveStoredCodeAnalysis(
  organizationId: string,
  metadataJson?: string,
): Promise<StoredCodeAnalysis | null> {
  const fromDb = await loadStoredCodeAnalysisFromDb(organizationId);
  if (fromDb) return fromDb;
  if (metadataJson) return getStoredCodeAnalysisSnapshot(metadataJson);
  return null;
}

export function snapshotForFilters(
  stored: StoredCodeAnalysis,
  filters: Partial<CodeAnalysisFilters>,
): CodeAnalysisSnapshot {
  return snapshotForStoredData(stored, filters);
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function countApprovals(reviews: { state: string }[]): number {
  return reviews.filter((r) => r.state === "APPROVED").length;
}

async function fetchRepoAnalysis(
  token: string,
  fullName: string,
  since: string,
): Promise<{ commits: CodeAnalysisCommit[]; pullRequests: CodeAnalysisPullRequest[] }> {
  const { owner, repo } = parseOwnerRepo(fullName);
  const commits: CodeAnalysisCommit[] = [];
  const pullRequests: CodeAnalysisPullRequest[] = [];

  const commitList = await listCommits(token, owner, repo, {
    since,
    perPage: MAX_COMMITS_PER_REPO,
  });

  for (const item of commitList.slice(0, MAX_COMMITS_PER_REPO)) {
    try {
      const detail = await getCommit(token, owner, repo, item.sha);
      const additions = detail.stats?.additions ?? 0;
      const deletions = detail.stats?.deletions ?? 0;
      const message = detail.commit.message;
      const classified = classifyCommit({ message, additions, deletions });
      const author = detail.author?.login ?? item.author?.login ?? "unknown";

      const signals = [...classified.signals];
      for (const f of detail.files?.slice(0, 5) ?? []) {
        if (f.additions > 80) signals.push(`File: ${f.filename}`);
      }

      commits.push({
        sha: item.sha.slice(0, 7),
        message: message.split("\n")[0],
        repo: fullName,
        author: typeof author === "string" && author.includes("T") ? "unknown" : String(author),
        committedAt: detail.commit.author?.date ?? item.commit.author?.date ?? new Date().toISOString(),
        url: detail.html_url,
        additions,
        deletions,
        attribution: classified.attribution,
        confidence: classified.confidence,
        signals,
      });
    } catch (e) {
      if (e instanceof GitHubApiError && (e.status === 404 || e.status === 403)) continue;
      throw e;
    }
  }

  const closedPulls = await listClosedPulls(token, owner, repo, MAX_PRS_PER_REPO);
  const mergedPulls = closedPulls
    .filter((p) => p.merged_at && new Date(p.merged_at).getTime() >= new Date(since).getTime())
    .slice(0, MAX_PRS_PER_REPO);

  for (const pr of mergedPulls) {
    try {
      const [files, reviews] = await Promise.all([
        getPullRequestFiles(token, owner, repo, pr.number),
        listPullRequestReviews(token, owner, repo, pr.number),
      ]);

      const linesAdded = files.reduce((n, f) => n + f.additions, 0);
      const linesRemoved = files.reduce((n, f) => n + f.deletions, 0);
      const prCommits = commits.filter((c) => c.repo === fullName);
      const commitClassifications = prCommits.slice(0, 5).map((c) =>
        classifyCommit({
          message: c.message,
          additions: c.additions,
          deletions: c.deletions,
          prBody: pr.body,
        }),
      );

      const classified = classifyPullRequest({
        body: pr.body,
        linesAdded,
        linesRemoved,
        commitClassifications,
      });

      pullRequests.push({
        id: `${fullName}#${pr.number}`,
        number: pr.number,
        title: pr.title,
        repo: fullName,
        author: pr.user?.login ?? "unknown",
        mergedAt: pr.merged_at!,
        url: pr.html_url,
        linesAdded,
        linesRemoved,
        attribution: classified.attribution,
        confidence: classified.confidence,
        reviewCount: countApprovals(reviews),
        tools: classified.tools,
      });
    } catch (e) {
      if (e instanceof GitHubApiError && (e.status === 404 || e.status === 403)) continue;
      throw e;
    }
  }

  return { commits, pullRequests };
}

export async function syncCodeAnalysis(input: {
  organizationId: string;
  userId: string | null;
}): Promise<{
  summary: string;
  stored: StoredCodeAnalysis;
}> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "GITHUB",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("GitHub is not connected");
  }

  const meta = parseIntegrationMeta(integration.metadataJson);
  if (!meta.installationId) {
    throw new Error("Install the GitHub App before running code analysis");
  }

  const token = await resolveGitHubTokenForIntegration(integration);
  const targetFullNames = resolveSyncRepoFullNames({ metaNames: meta.repoFullNames });

  const installationRepos = await listInstallationRepos(token);
  const granted = new Set(installationRepos.map((r) => r.full_name.toLowerCase()));

  for (const name of targetFullNames) {
    if (!granted.has(name.toLowerCase())) {
      const { owner, repo } = parseOwnerRepo(name);
      try {
        await getRepo(token, owner, repo);
      } catch {
        throw new Error(
          `Repository ${name} is not granted to the GitHub App installation`,
        );
      }
    }
  }

  const since = sinceIso(FETCH_WINDOW_DAYS);
  const allCommits: CodeAnalysisCommit[] = [];
  const allPullRequests: CodeAnalysisPullRequest[] = [];

  for (const fullName of targetFullNames.slice(0, MAX_GITHUB_SYNC_REPOS)) {
    try {
      const { commits, pullRequests } = await fetchRepoAnalysis(token, fullName, since);
      allCommits.push(...commits);
      allPullRequests.push(...pullRequests);
    } catch (e) {
      if (e instanceof GitHubApiError && e.status === 403) continue;
      throw e;
    }
  }

  if (allCommits.length === 0 && allPullRequests.length === 0) {
    throw new Error("No commits or merged PRs found in the analysis window");
  }

  const syncedAt = new Date().toISOString();
  const stored: StoredCodeAnalysis = {
    syncedAt,
    repos: targetFullNames,
    pullRequests: allPullRequests,
    commits: allCommits,
  };

  const snapshot = snapshotForStoredData(stored, { range: "30d", repos: targetFullNames });
  const summary = `Analyzed ${targetFullNames.length} repos · ${allCommits.length} commits · ${allPullRequests.length} merged PRs · ${snapshot.kpis.aiLinesPct}% AI lines`;

  const metadataJson = mergeGitHubMeta(meta, {
    codeAnalysisSnapshot: stored,
    lastSyncSummary: summary,
  } satisfies Partial<GitHubIntegrationMeta>);

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      metadataJson,
      lastSyncAt: new Date(),
      lastError: null,
    },
  });

  await persistCodeAnalysisToDb({
    organizationId: input.organizationId,
    integrationId: integration.id,
    repos: targetFullNames,
    commits: allCommits,
    pullRequests: allPullRequests,
    summary,
    syncedAt: new Date(syncedAt),
  });

  await markIntegrationSync(input.organizationId, "GITHUB");

  await prisma.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: "integration.synced",
      title: "Code analysis completed",
      description: summary,
      metadataJson: JSON.stringify({
        provider: "GITHUB",
        commitCount: allCommits.length,
        prCount: allPullRequests.length,
        aiLinesPct: snapshot.kpis.aiLinesPct,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "code_analysis.analyzed",
      entityType: "Integration",
      entityId: integration.id,
      metadataJson: JSON.stringify({
        repoFullNames: targetFullNames,
        commitCount: allCommits.length,
        prCount: allPullRequests.length,
      }),
    },
  });

  return { summary, stored };
}
