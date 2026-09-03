import { devopsAgent } from "./devops-agent";
import { governanceAgent } from "./governance-agent";
import { productivityAgent } from "./productivity-agent";
import { productIntelligenceAgent } from "./product-intelligence";
import { qaAgent } from "./qa-agent";
import { aidosAssistant } from "./aidos-assistant";

/**
 * Four domain agents (productivity, qa, governance, devops), the
 * in-process AIDOS chat assistant, and a lightweight product-intelligence agent
 * for executive briefing polish (no tools).
 */
export const aidosAgents = {
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent,
  aidosAssistant,
  productIntelligenceAgent,
} as const;

export {
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent,
  aidosAssistant,
  productIntelligenceAgent,
};

export {
  AIDOS_ASSISTANT_ID,
  AIDOS_ASSISTANT_INSTRUCTIONS,
  DRYDOCK_ASSISTANT_ID,
} from "./aidos-assistant";
