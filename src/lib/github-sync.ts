import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { prisma } from "@/lib/prisma";
import { markIntegrationSync } from "@/lib/integration-health";
import {
  getRepo,
  GitHubApiError,
  listInstallationRepos,
  listOpenPulls,
  listWorkflowRuns,
  parseOwnerRepo,
} from "@/lib/github-api";
import { ingestWorkflowRunArtifacts } from "@/lib/drydock/github-artifacts";
import { resolveSyncRepoFullNames } from "@/lib/github-repo-selection";
import { resolveGitHubTokenForIntegration } from "@/lib/github-token";
import {
  mergeGitHubMeta,
  parseIntegrationMeta,
  type GitHubRepoSummary,
} from "@/lib/integration-meta";
import { maybeIntrospectGitHubAfterSync } from "@/lib/github-introspection";
import { ingestNormalizedEvents } from "@/lib/telemetry-ingest";
import { determineActorType } from "@/lib/audit-helpers";

export async function syncGitHubIntegration(input: {
  organizationId: string;
  userId: string;
  repoFullNames?: string[];
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

  const token = await resolveGitHubTokenForIntegration(integration);
  const meta = parseIntegrationMeta(integration.metadataJson);

  const targetFullNames = resolveSyncRepoFullNames({
    metaNames: meta.repoFullNames,
    bodyNames: input.repoFullNames,
  });

  const installationRepos = await listInstallationRepos(token);
  const byFullName = new Map(
    installationRepos.map((r) => [r.full_name.toLowerCase(), r]),
  );

  const summaries: GitHubRepoSummary[] = [];

  for (const fullName of targetFullNames) {
    const repo = await resolveGitHubRepoForSync(token, fullName, byFullName);
    if (!repo) continue;
    summaries.push({
      id: repo.id,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at,
      openPrs: repo.open_issues_count,
    });
  }

  if (summaries.length === 0) {
    throw new Error("No accessible repositories matched your selection");
  }

  const telemetryEvents: Parameters<typeof ingestNormalizedEvents>[0]["events"] = [
    {
      eventType: "cicd",
      source: "github",
      severity: "info",
      payload: {
        action: "sync.started",
        repoCount: summaries.length,
        repoFullNames: targetFullNames,
      },
    },
  ];

  for (const repo of summaries) {
    const { owner, repo: repoName } = parseOwnerRepo(repo.fullName);
    try {
      const [pulls, runs] = await Promise.all([
        listOpenPulls(token, owner, repoName, 100),
        listWorkflowRuns(token, owner, repoName, 50),
      ]);

      repo.openPrs = pulls.length;

      const labelCounts = new Map<string, number>();
      for (const pr of pulls) {
        for (const label of pr.labels ?? []) {
          labelCounts.set(label.name, (labelCounts.get(label.name) ?? 0) + 1);
        }
      }
      repo.commonPrLabels = [...labelCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name]) => name);

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

      repo.recentWorkflowRuns = runs.map((run) => ({
        name: run.name,
        conclusion:
          run.conclusion === "success" ||
          run.conclusion === "failure" ||
          run.conclusion === "cancelled"
            ? run.conclusion
            : null,
        headBranch: run.head_branch,
        updatedAt: run.updated_at,
      }));

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

      try {
        const ingest = await ingestWorkflowRunArtifacts({
          organizationId: input.organizationId,
          accessToken: token,
          owner,
          repo: repoName,
          repositoryFullName: repo.fullName,
          runs,
        });
        if (ingest.reportsIngested > 0 || ingest.errors.length > 0) {
          telemetryEvents.push({
            eventType: "cicd",
            source: "github",
            severity: ingest.errors.length ? "warning" : "info",
            service: repo.fullName,
            payload: {
              action: "drydock.junit_ingest",
              reportsIngested: ingest.reportsIngested,
              artifactsDownloaded: ingest.artifactsDownloaded,
              errorCount: ingest.errors.length,
            },
          });
        }
      } catch {
        // Artifact ingest is best-effort; GitHub metadata sync still succeeds.
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

  const summary = `Synced ${targetFullNames.join(", ")} · ${telemetryEvents.length} signals`;

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      metadataJson: mergeGitHubMeta(meta, {
        repos: summaries,
        repoFullNames: targetFullNames,
        lastSyncSummary: summary,
      }),
      lastSyncAt: new Date(),
      lastError: null,
    },
  });

  await markIntegrationSync(input.organizationId, "GITHUB");

  invalidateExecutiveBriefingSnapshot(input.organizationId);

  void maybeIntrospectGitHubAfterSync(input.organizationId);

  await prisma.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: "integration.synced",
      title: "GitHub metadata synchronized",
      description: summary,
      metadataJson: JSON.stringify({
        provider: "GITHUB",
        repoCount: summaries.length,
        repoFullNames: targetFullNames,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "integration.github.synced",
      entityType: "Integration",
      entityId: integration.id,
      metadataJson: JSON.stringify({
        repoCount: summaries.length,
        repoFullNames: targetFullNames,
      }),
      actorType: determineActorType(input.userId, "integration.github.synced"),
    },
  });

  return {
    repoCount: summaries.length,
    eventCount: telemetryEvents.length,
    repos: summaries,
    summary,
  };
}

async function resolveGitHubRepoForSync(
  token: string,
  fullName: string,
  byFullName: Map<string, { id: number; full_name: string; private: boolean; default_branch: string; updated_at: string; open_issues_count: number }>,
): Promise<{ id: number; full_name: string; private: boolean; default_branch: string; updated_at: string; open_issues_count: number } | null> {
  const cached = byFullName.get(fullName.toLowerCase());
  if (cached) return cached;
  const { owner, repo: repoName } = parseOwnerRepo(fullName);
  try {
    return await getRepo(token, owner, repoName);
  } catch (e) {
    if (e instanceof GitHubApiError && (e.status === 404 || e.status === 403)) {
      return null;
    }
    throw e;
  }
}
