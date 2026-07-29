import { devopsAgent } from "./devops-agent";
import { governanceAgent } from "./governance-agent";
import { productivityAgent } from "./productivity-agent";
import { qaAgent } from "./qa-agent";

/**
 * Four domain agents migrated from mastra-test-app R&D:
 * productivity (git), qa (Jira), governance (repowise), devops (AWS hygiene).
 */
export const aidosAgents = {
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent,
} as const;

export {
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent,
};
