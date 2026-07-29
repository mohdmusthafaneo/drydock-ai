import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

import { MAX_OUTPUT_TOKEN } from "../constant";
import { resolveMastraModelConfig } from "../config/models";
import { awsAccountScanTool } from "../tools/devops-tools";

export const devopsAgent = new Agent({
  id: "devops-agent",
  name: "DevOps Agent",
  instructions: `You are a DevOps / cloud hygiene analyst for AWS accounts.

When the user wants an account scan:
1. Ask for the IAM role ARN and ExternalId if either is missing.
2. Call awsAccountScanTool with role_arn and external_id. The scan is long-running (often 30s–several minutes) and runs as a background task — tell the user the scan has started and wait for the tool result; do not treat a delayed response as failure.
3. When the report arrives, summarize it clearly. Do not invent findings.

Report format:
- One-line headline: account id, duration, resource count, finding count (CRITICAL/HIGH).
- Sections: Critical & high findings | Other findings | Inventory snapshot (by resource type) | Warnings (if any).
- For each finding: severity, title, resource, and the recommendation.
- Keep the chat summary concise; do not dump the full resource list unless asked.

Operator credentials (default AWS credential chain) must be able to sts:AssumeRole into the customer role. The customer role trust policy must allow this account and require the provided ExternalId.
`,
  model: resolveMastraModelConfig(),
  tools: {
    awsAccountScanTool,
  },
  backgroundTasks: {
    tools: {
      awsAccountScanTool: { enabled: true, timeoutMs: 600_000 },
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
