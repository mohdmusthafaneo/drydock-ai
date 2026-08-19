import { prisma } from "@/lib/prisma";
import { readJsonField } from "@/lib/json-field";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { parseOwnerRepo, getPullRequest } from "@/lib/github-api";
import { resolveGitHubTokenForIntegration } from "@/lib/github-token";
import { fetchJiraIssueTexts } from "@/lib/code-analysis/jira-issue-fetch";

const CORRELATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const MAX_LINKS = 5;

export type IncidentCodeLinkView = {
  id: string;
  pullRequestExternalId: string | null;
  commitSha: string | null;
  confidence: number;
  reason: string;
  people: string[];
  pr?: {
    number: number;
    title: string;
    url: string;
    repo: string;
    author: string;
    reviewers: string[];
    mergedAt: string;
    attribution: string;
  };
};

function parsePeopleJson(json: unknown): string[] {
  const parsed = readJsonField<unknown>(json, []);
  return Array.isArray(parsed) ? (parsed as string[]) : [];
}

function parseReviewersJson(json: unknown): string[] {
  const parsed = readJsonField<unknown>(json, []);
  return Array.isArray(parsed) ? (parsed as string[]) : [];
}

function parseJiraKeysJson(json: unknown): string[] {
  const parsed = readJsonField<unknown>(json, []);
  return Array.isArray(parsed) ? (parsed as string[]) : [];
}

function rollupPeople(
  author: string,
  reviewers: string[],
  jiraAssignees: string[] = [],
): string[] {
  return [...new Set([author, ...reviewers, ...jiraAssignees].filter(Boolean))];
}

function normalizeSha(sha: string | null | undefined): string | null {
  if (!sha) return null;
  return sha.slice(0, 7).toLowerCase();
}

function repoMatchesService(repo: string, services: string[]): boolean {
  if (services.length === 0) return true;
  const repoName = repo.split("/").pop()?.toLowerCase() ?? "";
  return services.some((service) => {
    const normalized = service.toLowerCase();
    return (
      repoName.includes(normalized) ||
      normalized.includes(repoName) ||
      repo.toLowerCase().includes(normalized)
    );
  });
}

function parseServiceScope(serviceScope: string | null | undefined): string[] {
  if (!serviceScope) return [];
  try {
    const parsed = JSON.parse(serviceScope) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return serviceScope.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

async function resolveReleaseRepoFullName(
  organizationId: string,
  release: { branch: string | null; serviceScope: string | null },
): Promise<string | null> {
  const scopes = parseServiceScope(release.serviceScope);
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "GITHUB" },
    },
  });
  if (!integration) return null;

  const meta = parseIntegrationMeta(integration.metadataJson);
  const repos = meta.repoFullNames ?? meta.repos?.map((r) => r.fullName) ?? [];
  if (repos.length === 0) return null;

  if (scopes.length > 0) {
    for (const scope of scopes) {
      const normalized = scope.toLowerCase();
      const match = repos.find((repo) => {
        const name = repo.split("/").pop()?.toLowerCase() ?? "";
        return name === normalized || repo.toLowerCase().includes(normalized);
      });
      if (match) return match;
    }
  }

  if (release.branch) {
    const branchMatch = repos.find((repo) => repo.toLowerCase().includes(release.branch!.toLowerCase()));
    if (branchMatch) return branchMatch;
  }

  return repos[0] ?? null;
}

function mapStoredLinks(
  stored: Array<{
    id: string;
    pullRequestExternalId: string | null;
    commitSha: string | null;
    confidence: number;
    reason: string;
    peopleJson: unknown;
  }>,
  prByExternalId: Map<
    string,
    {
      number: number;
      title: string;
      url: string;
      repo: string;
      author: string;
      reviewersJson: unknown;
      mergedAt: Date;
      attribution: string;
    }
  >,
): IncidentCodeLinkView[] {
  return stored.map((link) => {
    const prRow = link.pullRequestExternalId
      ? prByExternalId.get(link.pullRequestExternalId)
      : undefined;
    return {
      id: link.id,
      pullRequestExternalId: link.pullRequestExternalId,
      commitSha: link.commitSha,
      confidence: link.confidence,
      reason: link.reason,
      people: parsePeopleJson(link.peopleJson),
      pr: prRow
        ? {
            number: prRow.number,
            title: prRow.title,
            url: prRow.url,
            repo: prRow.repo,
            author: prRow.author,
            reviewers: parseReviewersJson(prRow.reviewersJson),
            mergedAt: prRow.mergedAt.toISOString(),
            attribution: prRow.attribution,
          }
        : undefined,
    };
  });
}

/** Read persisted incident↔code links without recomputing. */
export async function loadIncidentCodeLinks(input: {
  organizationId: string;
  incidentId: string;
}): Promise<IncidentCodeLinkView[]> {
  const stored = await prisma.incidentCodeLink.findMany({
    where: { organizationId: input.organizationId, incidentId: input.incidentId },
    orderBy: { confidence: "desc" },
  });
  if (stored.length === 0) return [];

  const prIds = stored
    .map((link) => link.pullRequestExternalId)
    .filter((id): id is string => Boolean(id));
  const prs = await prisma.codeAnalysisPullRequest.findMany({
    where: {
      organizationId: input.organizationId,
      externalId: { in: prIds },
    },
  });

  return mapStoredLinks(stored, new Map(prs.map((pr) => [pr.externalId, pr])));
}

export async function correlateIncidentCodeChanges(input: {
  organizationId: string;
  incidentId: string;
  force?: boolean;
}): Promise<IncidentCodeLinkView[]> {
  if (!input.force) {
    const cached = await loadIncidentCodeLinks(input);
    if (cached.length > 0) return cached;
  }

  const incident = await prisma.incident.findFirst({
    where: { id: input.incidentId, organizationId: input.organizationId },
    include: { release: true },
  });

  if (!incident) return [];

  let services: string[] = [];
  try {
    services = readJsonField(incident.affectedServicesJson, []) as string[];
  } catch {
    services = [];
  }

  const releaseRepo = incident.release
    ? await resolveReleaseRepoFullName(input.organizationId, incident.release)
    : null;

  const windowStart = new Date(incident.detectedAt.getTime() - CORRELATION_WINDOW_MS);

  const deployment = incident.releaseId
    ? await prisma.deploymentEvent.findFirst({
        where: {
          organizationId: input.organizationId,
          releaseId: incident.releaseId,
        },
        orderBy: { deployedAt: "desc" },
      })
    : null;

  const mergedBefore = deployment?.deployedAt ?? incident.detectedAt;
  const deploySha = normalizeSha(deployment?.mergeCommitSha);

  const candidatePrs = await prisma.codeAnalysisPullRequest.findMany({
    where: {
      organizationId: input.organizationId,
      mergedAt: {
        gte: windowStart,
        lte: mergedBefore,
      },
      ...(releaseRepo ? { repo: releaseRepo } : {}),
    },
    orderBy: { mergedAt: "desc" },
    take: 40,
  });

  const allJiraKeys = [
    ...new Set(candidatePrs.flatMap((pr) => parseJiraKeysJson(pr.jiraKeysJson))),
  ];
  const jiraIssues = await fetchJiraIssueTexts(input.organizationId, allJiraKeys);
  const assigneeByKey = new Map<string, string>();
  for (const [key, issue] of jiraIssues.entries()) {
    if (issue.assignee) assigneeByKey.set(key, issue.assignee);
  }

  const scored: Array<{
    pullRequestExternalId: string;
    commitSha: string | null;
    confidence: number;
    reason: string;
    people: string[];
    pr: {
      number: number;
      title: string;
      url: string;
      repo: string;
      author: string;
      reviewers: string[];
      mergedAt: string;
      attribution: string;
    };
    mergedAt: Date;
  }> = [];

  for (const pr of candidatePrs.filter((row) => repoMatchesService(row.repo, services))) {
    const hoursBefore =
      (incident.detectedAt.getTime() - pr.mergedAt.getTime()) / (60 * 60 * 1000);
    let confidence = Math.max(0.2, 1 - hoursBefore / 72);
    let reason = `Merged ${Math.round(hoursBefore)}h before incident detection`;
    let commitSha: string | null = null;

    const repoScopedPrMatch =
      deployment?.pullRequestNumber != null &&
      pr.number === deployment.pullRequestNumber &&
      (!releaseRepo || pr.repo === releaseRepo);

    if (repoScopedPrMatch) {
      confidence = 0.95;
      reason = "Matched deploy anchor PR";
      commitSha = deployment?.mergeCommitSha ?? null;
    } else if (deploySha) {
      const commitInRepo = await prisma.codeAnalysisCommit.findFirst({
        where: {
          organizationId: input.organizationId,
          repo: pr.repo,
          sha: deploySha,
        },
      });
      if (commitInRepo) {
        confidence = 0.9;
        reason = "Matched deploy merge commit SHA";
        commitSha = deployment?.mergeCommitSha ?? commitInRepo.sha;
      }
    }

    const reviewers = parseReviewersJson(pr.reviewersJson);
    const jiraKeys = parseJiraKeysJson(pr.jiraKeysJson);
    const jiraAssignees = jiraKeys
      .map((key) => assigneeByKey.get(key))
      .filter((name): name is string => Boolean(name));
    const people = rollupPeople(pr.author, reviewers, jiraAssignees);

    scored.push({
      pullRequestExternalId: pr.externalId,
      commitSha,
      confidence,
      reason,
      people,
      pr: {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        repo: pr.repo,
        author: pr.author,
        reviewers,
        mergedAt: pr.mergedAt.toISOString(),
        attribution: pr.attribution,
      },
      mergedAt: pr.mergedAt,
    });
  }

  scored.sort(
    (a, b) => b.confidence - a.confidence || b.mergedAt.getTime() - a.mergedAt.getTime(),
  );
  const topScored = scored.slice(0, MAX_LINKS);

  await prisma.incidentCodeLink.deleteMany({
    where: { organizationId: input.organizationId, incidentId: incident.id },
  });

  if (topScored.length > 0) {
    await prisma.incidentCodeLink.createMany({
      data: topScored.map((item) => ({
        organizationId: input.organizationId,
        incidentId: incident.id,
        pullRequestExternalId: item.pullRequestExternalId,
        commitSha: item.commitSha,
        confidence: item.confidence,
        reason: item.reason,
        peopleJson: JSON.stringify(item.people),
      })),
    });
  }

  return loadIncidentCodeLinks(input);
}

export async function resolveDeployAnchor(input: {
  organizationId: string;
  releaseId: string;
}): Promise<{
  mergeCommitSha: string | null;
  pullRequestNumber: number | null;
  repo: string | null;
}> {
  const release = await prisma.release.findFirst({
    where: { id: input.releaseId, organizationId: input.organizationId },
  });
  if (!release) {
    return { mergeCommitSha: null, pullRequestNumber: null, repo: null };
  }

  const repo = await resolveReleaseRepoFullName(input.organizationId, release);
  const anchorTime = release.deployedAt ?? release.assessedAt ?? new Date();

  const pr = await prisma.codeAnalysisPullRequest.findFirst({
    where: {
      organizationId: input.organizationId,
      mergedAt: { lte: anchorTime },
      ...(repo ? { repo } : {}),
    },
    orderBy: { mergedAt: "desc" },
  });

  if (!pr) {
    return { mergeCommitSha: null, pullRequestNumber: null, repo };
  }

  let mergeCommitSha: string | null = null;
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId: input.organizationId, provider: "GITHUB" },
    },
  });

  if (integration?.status === "CONNECTED") {
    try {
      const token = await resolveGitHubTokenForIntegration(integration);
      const { owner, repo: repoName } = parseOwnerRepo(pr.repo);
      const detail = await getPullRequest(token, owner, repoName, pr.number);
      mergeCommitSha = detail.merge_commit_sha ?? null;
    } catch {
      mergeCommitSha = null;
    }
  }

  return {
    mergeCommitSha,
    pullRequestNumber: pr.number,
    repo: pr.repo,
  };
}
