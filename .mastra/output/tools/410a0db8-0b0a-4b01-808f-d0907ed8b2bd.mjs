import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { simpleGit } from 'simple-git';
import fs from 'node:fs/promises';
import path__default from 'node:path';
import { a as asSystem } from '../prisma.mjs';
import { p as parseIntegrationMeta, a as providerCredentials } from '../provider-credentials.mjs';
import { p as productivityWorkspace } from '../workspace.mjs';
import { r as resolveOrganizationId } from '../request-context.mjs';
import '@prisma/adapter-pg';
import 'pg';
import 'node:url';
import '@prisma/client/runtime/client';
import 'node:async_hooks';
import 'pino';
import 'ioredis';
import 'jose';
import 'node:crypto';
import '../token-crypto.mjs';
import 'node:fs';
import '@mastra/core/workspace';

async function resolveGitHubTokenForIntegration(integration) {
  const meta = parseIntegrationMeta(integration.metadataJson);
  if (!meta.installationId) {
    throw new Error(
      "GitHub App not installed \u2014 install the AIDOS app from Integrations, then sync again."
    );
  }
  return providerCredentials.getAccessToken(integration.organizationId, "GITHUB");
}

function cloneLocationFor(repositoryUrl) {
  const name = repositoryUrl.replace(/\.git$/i, "").split("/").filter(Boolean).pop() || "repo";
  return path__default.join(
    productivityWorkspace.filesystem.basePath,
    "github-repositories",
    name
  );
}
function parseGithubOwnerRepo(repositoryUrl) {
  const https = repositoryUrl.match(
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i
  );
  if (!https) return null;
  return { owner: https[1], repo: https[2] };
}
async function authenticatedCloneUrl(repositoryUrl, organizationId) {
  if (!organizationId) return repositoryUrl;
  const parsed = parseGithubOwnerRepo(repositoryUrl);
  if (!parsed) return repositoryUrl;
  const integration = await asSystem().integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "GITHUB"
      }
    }
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
const repositoryCloneTool = createTool({
  id: "repository-clone",
  description: "Clone a GitHub repository into the workspace (uses the org GitHub App token for private repos). If the destination already exists, reuses it (fetches latest) instead of failing.",
  inputSchema: z.object({
    repository_url: z.string(),
    branch: z.string().optional()
  }),
  outputSchema: z.object({
    cloned_location: z.string(),
    reused: z.boolean()
  }),
  execute: async (inputData, context) => {
    const organizationId = (() => {
      try {
        return resolveOrganizationId(context?.requestContext);
      } catch {
        return void 0;
      }
    })();
    const clone_location = cloneLocationFor(inputData.repository_url);
    const gitDir = path__default.join(clone_location, ".git");
    const remoteUrl = await authenticatedCloneUrl(
      inputData.repository_url,
      organizationId
    );
    try {
      await fs.access(gitDir);
      const git = simpleGit(clone_location);
      await git.remote(["set-url", "origin", remoteUrl]);
      await git.fetch(["--all", "--prune"]);
      if (inputData.branch) {
        const branches = await git.branch(["-a"]);
        if (branches.all.includes(inputData.branch) || branches.current === inputData.branch) {
          await git.checkout(inputData.branch);
        } else if (branches.all.includes(`remotes/origin/${inputData.branch}`)) {
          await git.checkout([
            "-B",
            inputData.branch,
            `origin/${inputData.branch}`
          ]);
        }
      }
      return { cloned_location: clone_location, reused: true };
    } catch {
    }
    await fs.mkdir(path__default.dirname(clone_location), { recursive: true });
    await simpleGit().clone(
      remoteUrl,
      clone_location,
      inputData.branch ? { "--branch": inputData.branch } : void 0
    );
    return { cloned_location: clone_location, reused: false };
  }
});
const getCommitsTool = createTool({
  id: "get-commits",
  description: "Get the commits of a repository (pass cloned local path or remote URL)",
  inputSchema: z.object({
    repository_url: z.string()
  }),
  outputSchema: z.object({
    commits: z.array(z.string())
  }),
  execute: async (inputData) => {
    const log = await simpleGit(inputData.repository_url).log();
    const commits = log.all.map(
      (commit) => `${commit.hash} ${commit.message}`
    );
    return { commits };
  }
});

export { getCommitsTool, repositoryCloneTool };
