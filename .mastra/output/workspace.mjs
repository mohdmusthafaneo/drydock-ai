import fs from 'node:fs';
import path__default from 'node:path';
import { Workspace, LocalSandbox, LocalFilesystem, LocalSkillSource } from '@mastra/core/workspace';

function resolveMastraDir() {
  const candidates = [
    process.env.MASTRA_DIR?.trim(),
    path__default.resolve(process.cwd(), "src/mastra"),
    process.cwd(),
    path__default.resolve(process.cwd(), "..")
  ].filter((p) => Boolean(p));
  for (const candidate of candidates) {
    if (fs.existsSync(path__default.join(candidate, "skills"))) {
      return candidate;
    }
  }
  return path__default.resolve(process.cwd(), "src/mastra");
}
const mastraDir = resolveMastraDir();
const SHARED_WORKSPACE_ROOT = path__default.resolve(
  process.cwd(),
  ".data/mastra-workspaces/shared"
);
const QA_WORKSPACE_ROOT = path__default.resolve(
  process.cwd(),
  ".data/mastra-workspaces/qa"
);
for (const root of [SHARED_WORKSPACE_ROOT, QA_WORKSPACE_ROOT]) {
  fs.mkdirSync(root, { recursive: true });
}
const productivityWorkspace = new Workspace({
  id: "productivity-workspace",
  name: "Productivity Workspace",
  filesystem: new LocalFilesystem({
    basePath: SHARED_WORKSPACE_ROOT
  }),
  sandbox: new LocalSandbox({
    workingDirectory: SHARED_WORKSPACE_ROOT
  }),
  skillSource: new LocalSkillSource({ basePath: mastraDir }),
  skills: ["skills"]
});
const qaWorkspace = new Workspace({
  id: "qa-workspace",
  name: "QA Workspace",
  filesystem: new LocalFilesystem({
    basePath: QA_WORKSPACE_ROOT
  }),
  sandbox: new LocalSandbox({
    workingDirectory: QA_WORKSPACE_ROOT
  })
});
const governanceWorkspace = new Workspace({
  id: "governance-workspace",
  name: "Governance Workspace",
  filesystem: new LocalFilesystem({
    basePath: SHARED_WORKSPACE_ROOT
  }),
  sandbox: new LocalSandbox({
    workingDirectory: SHARED_WORKSPACE_ROOT
  })
});

export { SHARED_WORKSPACE_ROOT as S, governanceWorkspace as g, productivityWorkspace as p, qaWorkspace as q, resolveMastraDir as r };
