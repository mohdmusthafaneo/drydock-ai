import type { Mastra } from "@mastra/core/mastra";

import { createMastraInstance } from "./server";

/** Eager instance for `mastra dev` / Studio (expects `export const mastra`). */
export const mastra = createMastraInstance();

let mastraInstance: Mastra | null = null;

/** Lazy Mastra singleton for Next.js worker and API routes (no top-level await). */
export async function getMastra(): Promise<Mastra> {
  if (!mastraInstance) {
    mastraInstance = mastra;
  }
  return mastraInstance;
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
  AIDOS_ASSISTANT_ID,
  AIDOS_ASSISTANT_INSTRUCTIONS,
} from "./agents";
export {
  aidosWorkflows,
  agentAnalysisRefreshWorkflow,
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
