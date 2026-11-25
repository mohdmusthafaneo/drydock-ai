import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

import { GOVERNANCE_AGENT_INSTRUCTIONS } from "@/lib/agents/prompt-text";
import { MAX_OUTPUT_TOKEN } from "../constant";
import { resolveMastraModelConfig } from "../config/models";
import { repositoryCloneTool } from "../tools/github-tools";
import {
  repowiseIndexTool,
  repowiseHealthTool,
  repowiseRiskTool,
  repowiseDeadCodeTool,
} from "../tools/repowise-tools";
import { persistGovernanceReportTool } from "../tools/governance/persist-report";
import { verifyGovernanceReportTool } from "../tools/governance/verify-report";
import { governanceWorkspace } from "../workspace";

export { GOVERNANCE_AGENT_INSTRUCTIONS };

export const governanceAgent = new Agent({
  id: "governance-agent",
  name: "Governance Agent",
  instructions: GOVERNANCE_AGENT_INSTRUCTIONS,
  model: resolveMastraModelConfig(),
  tools: {
    repositoryCloneTool,
    repowiseIndexTool,
    repowiseHealthTool,
    repowiseRiskTool,
    repowiseDeadCodeTool,
    persistGovernanceReportTool,
    verifyGovernanceReportTool,
  },
  memory: new Memory({
    options: {
      lastMessages: 100,
    },
  }),
  workspace: governanceWorkspace,
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: MAX_OUTPUT_TOKEN,
    },
  },
});
