import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

import { QA_AGENT_INSTRUCTIONS } from "@/lib/agents/prompt-text";
import { MAX_OUTPUT_TOKEN } from "../constant";
import { resolveMastraModelConfig } from "../config/models";
import { jiraMyselfTool, jiraJqlTool } from "../tools/jira-tools";
import { persistQAReportTool } from "../tools/qa/persist-report";
import { verifyQAReportTool } from "../tools/qa/verify-report";
import { qaWorkspace } from "../workspace";

export { QA_AGENT_INSTRUCTIONS };

export const qaAgent = new Agent({
  id: "qa-agent",
  name: "QA Agent",
  instructions: QA_AGENT_INSTRUCTIONS,
  model: resolveMastraModelConfig(),
  tools: {
    jiraMyselfTool,
    jiraJqlTool,
    persistQAReportTool,
    verifyQAReportTool,
  },
  memory: new Memory({
    options: {
      lastMessages: 100,
    },
  }),
  workspace: qaWorkspace,
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: MAX_OUTPUT_TOKEN,
    },
  },
});
