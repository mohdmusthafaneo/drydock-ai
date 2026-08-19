import fs from 'node:fs';
import path__default from 'node:path';
import { Workspace, LocalSkillSource, LocalSandbox, LocalFilesystem } from '@mastra/core/workspace';

function resolveMastraDir() {
  const candidates = [
    path__default.resolve(process.cwd(), "src/mastra"),
    path__default.resolve(process.cwd(), ".."),
    path__default.resolve(process.cwd())
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path__default.join(candidate, "skills", "analyze-git"))) {
      return candidate;
    }
  }
  return path__default.resolve(process.cwd(), "src/mastra");
}
const mastraDir = resolveMastraDir();
const workspaceRoot = path__default.resolve(
  process.cwd(),
  ".data",
  "mastra-workspaces"
);
const productivityBase = path__default.join(workspaceRoot, "productivity");
const qaBase = path__default.join(workspaceRoot, "qa");
const productivityWorkspace = new Workspace({
  id: "productivity-workspace",
  name: "Productivity Workspace",
  filesystem: new LocalFilesystem({
    basePath: productivityBase
  }),
  sandbox: new LocalSandbox({
    workingDirectory: productivityBase
  }),
  skillSource: new LocalSkillSource({ basePath: mastraDir }),
  skills: ["skills"]
});
const qaWorkspace = new Workspace({
  id: "qa-workspace",
  name: "QA Workspace",
  filesystem: new LocalFilesystem({
    basePath: qaBase
  }),
  sandbox: new LocalSandbox({
    workingDirectory: qaBase
  })
});
const governanceWorkspace = new Workspace({
  id: "governance-workspace",
  name: "Governance Workspace",
  filesystem: new LocalFilesystem({
    basePath: productivityBase
  }),
  sandbox: new LocalSandbox({
    workingDirectory: productivityBase
  })
});

export { governanceWorkspace as g, mastraDir as m, productivityWorkspace as p, qaWorkspace as q };
