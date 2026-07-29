import fs from "node:fs";
import path from "node:path";
import {
  Workspace,
  LocalFilesystem,
  LocalSandbox,
  LocalSkillSource,
} from "@mastra/core/workspace";

/**
 * Resolve `src/mastra` whether the process cwd is the repo root (Next.js),
 * `src/mastra` (`mastra dev -d`), or `src/mastra/public` (Studio public cwd).
 */
export function resolveMastraDir(): string {
  const candidates = [
    process.env.MASTRA_DIR?.trim(),
    path.resolve(process.cwd(), "src/mastra"),
    process.cwd(),
    path.resolve(process.cwd(), ".."),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "skills"))) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), "src/mastra");
}

const mastraDir = resolveMastraDir();

/** Shared clone root under `.data` (gitignored). */
export const SHARED_WORKSPACE_ROOT = path.resolve(
  process.cwd(),
  ".data/mastra-workspaces/shared",
);
const QA_WORKSPACE_ROOT = path.resolve(
  process.cwd(),
  ".data/mastra-workspaces/qa",
);

for (const root of [SHARED_WORKSPACE_ROOT, QA_WORKSPACE_ROOT]) {
  fs.mkdirSync(root, { recursive: true });
}

/** Productivity agent: sandboxed FS + analyze-git skill. */
export const productivityWorkspace = new Workspace({
  id: "productivity-workspace",
  name: "Productivity Workspace",
  filesystem: new LocalFilesystem({
    basePath: SHARED_WORKSPACE_ROOT,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: SHARED_WORKSPACE_ROOT,
  }),
  skillSource: new LocalSkillSource({ basePath: mastraDir }),
  skills: ["skills"],
});

/** QA agent: sandboxed FS only (no analyze-git / project skills). */
export const qaWorkspace = new Workspace({
  id: "qa-workspace",
  name: "QA Workspace",
  filesystem: new LocalFilesystem({
    basePath: QA_WORKSPACE_ROOT,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: QA_WORKSPACE_ROOT,
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
    basePath: SHARED_WORKSPACE_ROOT,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: SHARED_WORKSPACE_ROOT,
  }),
});
