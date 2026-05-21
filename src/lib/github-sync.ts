import { prisma } from "@/lib/prisma";
import { markIntegrationSync } from "@/lib/integration-health";
import {
  getGitHubAccessToken,
  getGitHubSyncRepoAllowlist,
  getRepo,
  GitHubApiError,
  listOpenPulls,
  listUserRepos,
  listWorkflowRuns,
  parseOwnerRepo,
} from "@/lib/github-api";
import { mergeGitHubMeta, parseIntegrationMeta, type GitHubRepoSummary } from "@/lib/integration-meta";
import { ingestNormalizedEvents } from "@/lib/telemetry-ingest";

const MAX_REPOS_DETAIL = 5;

export async function syncGitHubIntegration(input: {
  organizationId: string;
  userId: string;
}) {
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

  const token = getGitHubAccessToken(integration);
  if (!token) {
    throw new Error("GitHub token missing — reconnect via OAuth");
  }

  const meta = parseIntegrationMeta(integration.metadataJson);
  const allowlist = getGitHubSyncRepoAllowlist();
  const repos = await listUserRepos(token, 100);

  const summaries: GitHubRepoSummary[] = repos.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
    openPrs: r.open_issues_count,
  }));

  const byFullName = new Map(summaries.map((r) => [r.fullName.toLowerCase(), r]));

  for (const fullName of allowlist) {
    if (byFullName.has(fullName.toLowerCase())) continue;
    const { owner, repo: repoName } = parseOwnerRepo(fullName);
    try {
      const r = await getRepo(token, owner, repoName);
      const summary: GitHubRepoSummary = {
        id: r.id,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        updatedAt: r.updated_at,
        openPrs: r.open_issues_count,
      };
      summaries.unshift(summary);
      byFullName.set(summary.fullName.toLowerCase(), summary);
    } catch (e) {
      if (e instanceof GitHubApiError && (e.status === 404 || e.status === 403)) continue;
      throw e;
    }
  }

  const reposForDetail =
    allowlist.length > 0
      ? allowlist
          .map((name) => byFullName.get(name.toLowerCase()))
          .filter((r): r is GitHubRepoSummary => Boolean(r))
      : summaries.slice(0, MAX_REPOS_DETAIL);

  const telemetryEvents: Parameters<typeof ingestNormalizedEvents>[0]["events"] = [
    {
      eventType: "cicd",
      source: "github",
      severity: "info",
      payload: {
        action: "sync.started",
        repoCount: repos.length,
        allowlist: allowlist.length > 0 ? allowlist : undefined,
      },
    },
  ];

  for (const repo of reposForDetail) {
    const { owner, repo: repoName } = parseOwnerRepo(repo.fullName);
    try {
      const [pulls, runs] = await Promise.all([
        listOpenPulls(token, owner, repoName),
        listWorkflowRuns(token, owner, repoName, 3),
      ]);

      repo.openPrs = pulls.length;

      for (const pr of pulls.slice(0, 3)) {
        telemetryEvents.push({
          eventType: "release",
          source: "github",
          severity: "info",
          service: repo.fullName,
          payload: {
            action: "pull_request",
            number: pr.number,
            title: pr.title,
            state: pr.state,
            url: pr.html_url,
          },
          occurredAt: pr.updated_at,
        });
      }

      for (const run of runs) {
        const severity =
          run.conclusion === "failure" ? "error" : run.conclusion === "success" ? "info" : "warning";
        telemetryEvents.push({
          eventType: "cicd",
          source: "github",
          severity,
          service: repo.fullName,
          environment: run.head_branch,
          payload: {
            action: "workflow_run",
            name: run.name,
            status: run.status,
            conclusion: run.conclusion,
            url: run.html_url,
          },
          occurredAt: run.updated_at,
        });
      }
    } catch (e) {
      if (e instanceof GitHubApiError && e.status === 403) {
        continue;
      }
      throw e;
    }
  }

  await ingestNormalizedEvents({
    organizationId: input.organizationId,
    userId: input.userId,
    events: telemetryEvents,
  });

  const targetLabel =
    allowlist.length > 0 ? allowlist.join(", ") : `${reposForDetail.length} repos (recent)`;
  const summary = `Synced ${targetLabel} · ${telemetryEvents.length} signals`;

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      metadataJson: mergeGitHubMeta(meta, {
        repos: summaries,
        lastSyncSummary: summary,
      }),
      lastSyncAt: new Date(),
      lastError: null,
    },
  });

  await markIntegrationSync(input.organizationId, "GITHUB");

  await prisma.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: "integration.synced",
      title: "GitHub metadata synchronized",
      description: summary,
      metadataJson: JSON.stringify({ provider: "GITHUB", repoCount: repos.length }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "integration.github.synced",
      entityType: "Integration",
      entityId: integration.id,
      metadataJson: JSON.stringify({ repoCount: repos.length }),
    },
  });

  return { repoCount: repos.length, eventCount: telemetryEvents.length, repos: summaries, summary };
}
