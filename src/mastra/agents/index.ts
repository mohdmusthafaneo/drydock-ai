import { devopsAgent } from "./devops-agent";
import { governanceAgent } from "./governance-agent";
import { productivityAgent } from "./productivity-agent";
import { qaAgent } from "./qa-agent";
import { aidosAssistant } from "./aidos-assistant";

/**
 * Four domain agents (productivity, qa, governance, devops) plus the
 * in-process AIDOS chat assistant.
 */
export const aidosAgents = {
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent,
  aidosAssistant,
} as const;

export {
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent,
  aidosAssistant,
};

export {
  AIDOS_ASSISTANT_ID,
  AIDOS_ASSISTANT_INSTRUCTIONS,
} from "./aidos-assistant";
