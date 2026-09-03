import type { Mastra } from "@mastra/core/mastra";

import { createMastraInstance } from "./server";

let mastraInstance: Mastra | null = null;

function getOrCreateMastra(): Mastra {
  if (!mastraInstance) {
    mastraInstance = createMastraInstance();
  }
  return mastraInstance;
}

/** Lazy instance for `mastra dev` / Studio (expects `export const mastra`). */
export const mastra = new Proxy({} as Mastra, {
  get(_target, prop) {
    return (getOrCreateMastra() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** Lazy Mastra singleton for Next.js worker and API routes. */
export async function getMastra(): Promise<Mastra> {
  return getOrCreateMastra();
}

export { createMastraInstance } from "./server";
export type { CreateMastraOptions } from "./server";
export { resolveMastraModelConfig } from "./config/models";
export {
  resolveMastraPgSchema,
  resolveMastraPostgresConnectionString,
} from "./config/storage";
export {
  aidosAgents,
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent,
  aidosAssistant,
  productIntelligenceAgent,
  AIDOS_ASSISTANT_ID,
  AIDOS_ASSISTANT_INSTRUCTIONS,
  DRYDOCK_ASSISTANT_ID,
} from "./agents";
export {
  aidosWorkflows,
  agentAnalysisRefreshWorkflow,
  executiveBriefingEnrichWorkflow,
} from "./workflows";
export { runAidosAssistant } from "./workflows/run-assistant";
export type {
  AssistantStreamHandlers,
  RunAssistantInput,
  RunAssistantResult,
} from "./workflows/run-assistant";
export {
  createAidosRequestContext,
  createAidosToolContext,
  getAidosToolContext,
  AIDOS_TOOL_IDS,
  aidosTools,
} from "./tools/aidos";
export type {
  AidosToolId,
  AidosToolMap,
  AidosToolContext,
  AidosRequestContextValues,
} from "./tools/aidos";
export {
  repositoryCloneTool,
  getCommitsTool,
  materializeAnalyzeGitTool,
  jiraMyselfTool,
  jiraJqlTool,
  repowiseIndexTool,
  repowiseHealthTool,
  repowiseRiskTool,
  repowiseDeadCodeTool,
  awsAccountScanTool,
  persistProductivityReportTool,
  verifyProductivityReportTool,
  persistQAReportTool,
  verifyQAReportTool,
  persistGovernanceReportTool,
  verifyGovernanceReportTool,
  persistDevOpsAccountScanTool,
  verifyDevOpsAccountScanTool,
} from "./tools";
