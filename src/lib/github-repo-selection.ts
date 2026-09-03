import { prisma } from "@/lib/prisma";
import {
  getRepo,
  GitHubApiError,
  listInstallationRepos,
  parseOwnerRepo,
} from "@/lib/github-api";
import { resolveGitHubTokenForIntegration } from "@/lib/github-token";
import { mergeGitHubMeta, parseIntegrationMeta } from "@/lib/integration-meta";
import type { Integration } from "@/generated/prisma/client";

import { determineActorType } from "@/lib/audit-helpers";
export const MAX_GITHUB_SYNC_REPOS = 50;

export type GitHubRepoOption = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
};

export async function getConnectedGitHubIntegration(
  organizationId: string,
): Promise<Integration> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "GITHUB",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("GitHub is not connected");
  }

  return integration;
}

function normalizeRepoFullNames(names: string[]): string[] {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(
    0,
    MAX_GITHUB_SYNC_REPOS,
  );
}

export async function fetchOrgGitHubRepos(organizationId: string): Promise<{
  repos: GitHubRepoOption[];
  selectedFullNames: string[];
}> {
  const integration = await getConnectedGitHubIntegration(organizationId);
  const meta = parseIntegrationMeta(integration.metadataJson);
  const token = await resolveGitHubTokenForIntegration(integration);
  const installationRepos = await listInstallationRepos(token);

  return {
    repos: installationRepos.map((r) => ({
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
    })),
    selectedFullNames: meta.repoFullNames ?? [],
  };
}

export async function saveOrgGitHubRepoFullNames(input: {
  organizationId: string;
  userId: string;
  repoFullNames: string[];
}): Promise<{ repoFullNames: string[] }> {
  const names = normalizeRepoFullNames(input.repoFullNames);
  if (names.length === 0) {
    throw new Error("Select at least one repository");
  }

  const integration = await getConnectedGitHubIntegration(input.organizationId);
  const meta = parseIntegrationMeta(integration.metadataJson);
  const token = await resolveGitHubTokenForIntegration(integration);
  const installationRepos = await listInstallationRepos(token);
  const granted = new Set(installationRepos.map((r) => r.full_name.toLowerCase()));

  await assertReposAccessible(token, names, granted);

  const metadataJson = mergeGitHubMeta(meta, {
    repoFullNames: names,
  });

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: integration.id },
      data: { metadataJson, lastError: null },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "integration.github.repos_updated",
        entityType: "Integration",
        entityId: integration.id,
        metadataJson: JSON.stringify({ repoFullNames: names }),
        actorType: determineActorType(input.userId, "integration.github.repos_updated"),
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "integration.updated",
        title: "GitHub sync repositories updated",
        description: names.join(", "),
        metadataJson: JSON.stringify({ provider: "GITHUB", repoFullNames: names }),
      },
    });
  });

  return { repoFullNames: names };
}

export function resolveSyncRepoFullNames(input: {
  metaNames?: string[];
  bodyNames?: string[];
}): string[] {
  if (input.bodyNames && input.bodyNames.length > 0) {
    return normalizeRepoFullNames(input.bodyNames);
  }
  if (input.metaNames && input.metaNames.length > 0) {
    return normalizeRepoFullNames(input.metaNames);
  }
  throw new Error("Select at least one GitHub repository before syncing.");
}

async function assertReposAccessible(
  token: string,
  names: string[],
  granted: Set<string>,
): Promise<void> {
  for (const fullName of names) {
    if (granted.has(fullName.toLowerCase())) continue;
    const { owner, repo } = parseOwnerRepo(fullName);
    try {
      await getRepo(token, owner, repo);
    } catch (e) {
      if (e instanceof GitHubApiError && (e.status === 404 || e.status === 403)) {
        throw new Error(
          `Repository ${fullName} is not accessible — grant access in GitHub App settings`,
        );
      }
      throw e;
    }
  }
}
