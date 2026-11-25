import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

import { PRODUCTIVITY_AGENT_INSTRUCTIONS } from "@/lib/agents/prompt-text";
import { MAX_OUTPUT_TOKEN } from "../constant";
import { resolveMastraModelConfig } from "../config/models";
import { repositoryCloneTool, getCommitsTool } from "../tools/github-tools";
import { materializeAnalyzeGitTool } from "../tools/materialize-analyze-git";
import { persistProductivityReportTool } from "../tools/productivity/persist-report";
import { verifyProductivityReportTool } from "../tools/productivity/verify-report";
import { productivityWorkspace } from "../workspace";

export { PRODUCTIVITY_AGENT_INSTRUCTIONS };

export const productivityAgent = new Agent({
  id: "productivity-agent",
  name: "Productivity Agent",
  instructions: PRODUCTIVITY_AGENT_INSTRUCTIONS,
  model: resolveMastraModelConfig(),
  tools: {
    repositoryCloneTool,
    getCommitsTool,
    materializeAnalyzeGitTool,
    persistProductivityReportTool,
    verifyProductivityReportTool,
  },
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
