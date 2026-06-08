import { prisma } from "@/lib/prisma";
import { listBranches, parseOwnerRepo } from "@/lib/github-api";
import { resolveGitHubTokenForIntegration } from "@/lib/github-token";
import {
  mergeGitHubMeta,
  parseIntegrationMeta,
  type GitHubIntegrationMeta,
} from "@/lib/integration-meta";

export type GitHubSchemaSnapshot = {
  syncedAt: string;
  repos: Array<{
    fullName: string;
    defaultBranch: string;
    branches?: string[];
    commonPrLabels?: string[];
  }>;
  suggestions: {
    branchStrategy?: { value: string; reason: string };
    productionBranch?: { value: string; reason: string };
  };
};

const INTROSPECT_THROTTLE_MS = 5 * 60 * 1000;
const lastIntrospectAt = new Map<string, number>();

function rankGithubSuggestions(
  repos: GitHubSchemaSnapshot["repos"],
): GitHubSchemaSnapshot["suggestions"] {
  const allBranches = repos.flatMap((r) => r.branches ?? []);
  const branchSet = new Set(allBranches.map((b) => b.toLowerCase()));

  let branchStrategy: GitHubSchemaSnapshot["suggestions"]["branchStrategy"];
  if (allBranches.some((b) => b.startsWith("release/"))) {
    branchStrategy = {
      value: "release-branches",
      reason: "Release branch prefix detected in repo branches",
    };
  } else if (branchSet.has("develop") || branchSet.has("development")) {
    branchStrategy = {
      value: "gitflow",
      reason: "develop branch present — typical GitFlow pattern",
    };
  } else {
    branchStrategy = {
      value: "trunk",
      reason: "No develop or release/* branches detected",
    };
  }

  let productionBranch: GitHubSchemaSnapshot["suggestions"]["productionBranch"];
  if (branchSet.has("main")) {
    productionBranch = { value: "main", reason: "main branch found" };
  } else if (branchSet.has("master")) {
    productionBranch = { value: "master", reason: "master branch found" };
  } else {
    const mostCommon = repos[0]?.defaultBranch ?? "main";
    productionBranch = {
      value: mostCommon,
      reason: `Using most common default branch (${mostCommon})`,
    };
  }

  return { branchStrategy, productionBranch };
}

export async function introspectGitHubSchema(input: {
  organizationId: string;
  force?: boolean;
}): Promise<GitHubSchemaSnapshot> {
  const now = Date.now();
  const last = lastIntrospectAt.get(input.organizationId) ?? 0;
  if (!input.force && now - last < INTROSPECT_THROTTLE_MS) {
    throw new Error("Schema introspection was run recently — wait a few minutes before refreshing");
  }

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
  const token = await resolveGitHubTokenForIntegration(integration);
  const repoFullNames = meta.repoFullNames ?? meta.repos?.map((r) => r.fullName) ?? [];

  if (repoFullNames.length === 0) {
    throw new Error("Select GitHub repositories before introspecting");
  }

  const repos: GitHubSchemaSnapshot["repos"] = [];

  for (const fullName of repoFullNames.slice(0, 5)) {
    const existing = meta.repos?.find((r) => r.fullName === fullName);
    const { owner, repo } = parseOwnerRepo(fullName);
    let branches: string[] = [];
    try {
      const branchList = await listBranches(token, owner, repo, 30);
      branches = branchList.map((b) => b.name);
    } catch {
      branches = existing?.defaultBranch ? [existing.defaultBranch] : [];
    }

    repos.push({
      fullName,
      defaultBranch: existing?.defaultBranch ?? branches[0] ?? "main",
      branches,
      commonPrLabels: existing?.commonPrLabels,
    });
  }

  const syncedAt = new Date().toISOString();
  const snapshot: GitHubSchemaSnapshot = {
    syncedAt,
    repos,
    suggestions: rankGithubSuggestions(repos),
  };

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      metadataJson: mergeGitHubMeta(meta, {
        githubSchemaSnapshot: snapshot,
      } satisfies Partial<GitHubIntegrationMeta>),
    },
  });

  lastIntrospectAt.set(input.organizationId, now);
  return snapshot;
}

/** Best-effort introspection after GitHub sync. */
export async function maybeIntrospectGitHubAfterSync(organizationId: string): Promise<void> {
  try {
    const integration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "GITHUB" },
      },
    });
    if (!integration) return;

    const meta = parseIntegrationMeta(integration.metadataJson);
    if (!meta.repos?.length) return;
    if (meta.githubSchemaSnapshot) return;

    await introspectGitHubSchema({ organizationId, force: false });
  } catch {
    // best-effort
  }
}
