import fs from "node:fs";
import path from "node:path";
import {
  Workspace,
  LocalFilesystem,
  LocalSandbox,
  LocalSkillSource,
} from "@mastra/core/workspace";

/**
 * Resolve `src/mastra` whether cwd is the repo root (Next.js) or
 * `src/mastra` / `src/mastra/public` (Mastra Studio).
 */
export function resolveMastraDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "src/mastra"),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd()),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "skills", "analyze-git"))) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), "src/mastra");
}

export const mastraDir = resolveMastraDir();

/** Persistent sandbox roots under `.data/` (gitignored). */
export const workspaceRoot = path.resolve(
  process.cwd(),
  ".data",
  "mastra-workspaces",
);

const productivityBase = path.join(workspaceRoot, "productivity");
const qaBase = path.join(workspaceRoot, "qa");

/** Productivity agent: sandboxed FS + analyze-git skill. */
export const productivityWorkspace = new Workspace({
  id: "productivity-workspace",
  name: "Productivity Workspace",
  filesystem: new LocalFilesystem({
    basePath: productivityBase,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: productivityBase,
  }),
  skillSource: new LocalSkillSource({ basePath: mastraDir }),
  skills: ["skills"],
});

/** QA agent: sandboxed FS only (no analyze-git / project skills). */
export const qaWorkspace = new Workspace({
  id: "qa-workspace",
  name: "QA Workspace",
  filesystem: new LocalFilesystem({
    basePath: qaBase,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: qaBase,
  }),
});

/**
 * Governance agent: same clone root as productivity so repositoryCloneTool
 * reuses existing checkouts.
 */
export const governanceWorkspace = new Workspace({
  id: "governance-workspace",
  name: "Governance Workspace",
  filesystem: new LocalFilesystem({
    basePath: productivityBase,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: productivityBase,
  }),
});
