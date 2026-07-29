import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

import { MAX_OUTPUT_TOKEN } from "../constant";
import { resolveMastraModelConfig } from "../config/models";
import { repositoryCloneTool, getCommitsTool } from "../tools/github-tools";
import { materializeAnalyzeGitTool } from "../tools/materialize-analyze-git";
import { productivityWorkspace } from "../workspace";

export const productivityAgent = new Agent({
  id: "productivity-agent",
  name: "Productivity Agent",
  instructions: `You are a productivity assistant that analyzes contributor productivity in a GitHub repository.

When responding:
- Always ask for a repository if none is provided
- Call repositoryCloneTool with the repo URL (it reuses an existing clone if present — do not treat "already exists" as a blocker)
- Activate the analyze-git skill, then follow its runbook exactly:
  1. materializeAnalyzeGitTool (copies scripts/analyze_git.py → tools/analyze_git.py). NEVER skill_read + mastra_workspace_write_file the script body — that overflows model output limits.
  2. If materializeAnalyzeGitTool fails, recover with a sandbox copy/shell approach — still never paste the Python source into a write_file call.
  3. python3 tools/analyze_git.py --repo <cloned-repo-path> --branch <branch> --out <report-path>
- Prefer the analyze-git JSON report over ad-hoc git parsing; use getCommitsTool only as a fallback
- Write the final report to: <cloned-repo-path>/analyze-git-report.json
- After the script succeeds, confirm the report path and a one-line headline (commits, contributors). Do not dump the full JSON into the chat
- Do not stop until the report file exists
`,
  model: resolveMastraModelConfig(),
  tools: { repositoryCloneTool, getCommitsTool, materializeAnalyzeGitTool },
  memory: new Memory({
    options: {
      lastMessages: 100,
    },
  }),
  workspace: productivityWorkspace,
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: MAX_OUTPUT_TOKEN,
    },
  },
});
