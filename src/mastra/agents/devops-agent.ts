import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

import { DEVOPS_AGENT_INSTRUCTIONS } from "@/lib/agents/prompt-text";
import { MAX_OUTPUT_TOKEN } from "../constant";
import { resolveMastraModelConfig } from "../config/models";
import { persistDevOpsAccountScanTool } from "../tools/devops/persist-scan";
import { verifyDevOpsAccountScanTool } from "../tools/devops/verify-scan";

export { DEVOPS_AGENT_INSTRUCTIONS };

export const devopsAgent = new Agent({
  id: "devops-agent",
  name: "DevOps Agent",
  instructions: DEVOPS_AGENT_INSTRUCTIONS,
  model: resolveMastraModelConfig(),
  tools: {
    persistDevOpsAccountScanTool,
    verifyDevOpsAccountScanTool,
  },
  backgroundTasks: {
    tools: {
      persistDevOpsAccountScanTool: { enabled: true, timeoutMs: 600_000 },
    },
    waitTimeoutMs: 600_000,
  },
  memory: new Memory({
    options: {
      lastMessages: 100,
    },
  }),
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: MAX_OUTPUT_TOKEN,
    },
  },
});
