import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { simpleGit } from "simple-git";
import fs from "node:fs/promises";
import path from "node:path";

import { productivityWorkspace } from "../workspace";

function cloneLocationFor(repositoryUrl: string): string {
  return path.join(
    productivityWorkspace.filesystem!.basePath,
    "github-repositories",
    repositoryUrl.split("/").pop() || "",
  );
}

export const repositoryCloneTool = createTool({
  id: "repository-clone",
  description:
    "Clone a GitHub repository into the workspace. If the destination already exists, reuses it (fetches latest) instead of failing.",
  inputSchema: z.object({
    repository_url: z.string(),
    branch: z.string().optional(),
  }),
  outputSchema: z.object({
    cloned_location: z.string(),
    reused: z.boolean(),
  }),
  execute: async (inputData) => {
    const clone_location = cloneLocationFor(inputData.repository_url);
    const gitDir = path.join(clone_location, ".git");

    try {
      await fs.access(gitDir);
      const git = simpleGit(clone_location);
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
      inputData.repository_url,
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
