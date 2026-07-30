import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { simpleGit } from "simple-git";
import fs from "node:fs/promises";
import path from "node:path";

import { asSystem } from "@/lib/prisma";
import { resolveGitHubTokenForIntegration } from "@/lib/github-token";
import { productivityWorkspace } from "../workspace";
import { resolveOrganizationId } from "../config/request-context";

function cloneLocationFor(repositoryUrl: string): string {
  const name =
    repositoryUrl
      .replace(/\.git$/i, "")
      .split("/")
      .filter(Boolean)
      .pop() || "repo";
  return path.join(
    productivityWorkspace.filesystem!.basePath,
    "github-repositories",
    name,
  );
}

/** Parse owner/repo from https://github.com/owner/repo(.git) or git@github.com:owner/repo.git */
function parseGithubOwnerRepo(
  repositoryUrl: string,
): { owner: string; repo: string } | null {
  const https = repositoryUrl.match(
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i,
  );
  if (!https) return null;
  return { owner: https[1], repo: https[2] };
}

async function authenticatedCloneUrl(
  repositoryUrl: string,
  organizationId: string | undefined,
): Promise<string> {
  if (!organizationId) return repositoryUrl;
  const parsed = parseGithubOwnerRepo(repositoryUrl);
  if (!parsed) return repositoryUrl;

  const integration = await asSystem().integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "GITHUB",
      },
    },
  });
  if (!integration || integration.status !== "CONNECTED") {
    return repositoryUrl;
  }

  try {
    const token = await resolveGitHubTokenForIntegration(integration);
    return `https://x-access-token:${token}@github.com/${parsed.owner}/${parsed.repo}.git`;
  } catch {
    return repositoryUrl;
  }
}

export const repositoryCloneTool = createTool({
  id: "repository-clone",
  description:
    "Clone a GitHub repository into the workspace (uses the org GitHub App token for private repos). If the destination already exists, reuses it (fetches latest) instead of failing.",
  inputSchema: z.object({
    repository_url: z.string(),
    branch: z.string().optional(),
  }),
  outputSchema: z.object({
    cloned_location: z.string(),
    reused: z.boolean(),
  }),
  execute: async (inputData, context) => {
    const organizationId = (() => {
      try {
        return resolveOrganizationId(context?.requestContext);
      } catch {
        return undefined;
      }
    })();

    const clone_location = cloneLocationFor(inputData.repository_url);
    const gitDir = path.join(clone_location, ".git");
    const remoteUrl = await authenticatedCloneUrl(
      inputData.repository_url,
      organizationId,
    );

    try {
      await fs.access(gitDir);
      const git = simpleGit(clone_location);
      // Refresh remote URL so private-repo fetches use the installation token.
      await git.remote(["set-url", "origin", remoteUrl]);
      await git.fetch(["--all", "--prune"]);
      if (inputData.branch) {
        const branches = await git.branch(["-a"]);
        if (
          branches.all.includes(inputData.branch) ||
          branches.current === inputData.branch
        ) {
          await git.checkout(inputData.branch);
        } else if (
          branches.all.includes(`remotes/origin/${inputData.branch}`)
        ) {
          await git.checkout([
            "-B",
            inputData.branch,
            `origin/${inputData.branch}`,
          ]);
        }
      }
      return { cloned_location: clone_location, reused: true };
    } catch {
      // Path missing or not a git repo — clone fresh.
    }

    await fs.mkdir(path.dirname(clone_location), { recursive: true });
    await simpleGit().clone(
      remoteUrl,
      clone_location,
      inputData.branch ? { "--branch": inputData.branch } : undefined,
    );
    return { cloned_location: clone_location, reused: false };
  },
});

export const getCommitsTool = createTool({
  id: "get-commits",
  description: "Get the commits of a repository (pass cloned local path or remote URL)",
  inputSchema: z.object({
    repository_url: z.string(),
  }),
  outputSchema: z.object({
    commits: z.array(z.string()),
  }),
  execute: async (inputData) => {
    const log = await simpleGit(inputData.repository_url).log();
    const commits = log.all.map(
      (commit) => `${commit.hash} ${commit.message}`,
    );
    return { commits };
  },
});
