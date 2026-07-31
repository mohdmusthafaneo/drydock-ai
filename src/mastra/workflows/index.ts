import { agentAnalysisRefreshWorkflow } from "./agent-analysis-refresh";
import { executiveBriefingEnrichWorkflow } from "./executive-briefing-enrich";

export const aidosWorkflows = {
  agentAnalysisRefreshWorkflow,
  executiveBriefingEnrichWorkflow,
} as const;

export { agentAnalysisRefreshWorkflow, executiveBriefingEnrichWorkflow };
