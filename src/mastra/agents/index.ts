import { devopsAgent } from "./devops-agent";
import { governanceAgent } from "./governance-agent";
import { productivityAgent } from "./productivity-agent";
import { productIntelligenceAgent } from "./product-intelligence";
import { qaAgent } from "./qa-agent";
import { aidosAssistant } from "./aidos-assistant";
import { drydockAssistant } from "./drydock-assistant";

/**
 * Four domain agents (productivity, qa, governance, devops), the
 * in-process AIDOS Conversations assistant, a lightweight product-intelligence
 * agent for executive briefing polish (no tools), and the floating DryDock assistant.
 */
export const aidosAgents = {
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent,
  aidosAssistant,
  productIntelligenceAgent,
  drydockAssistant,
} as const;

export {
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent,
  aidosAssistant,
  productIntelligenceAgent,
  drydockAssistant,
};

export {
  AIDOS_ASSISTANT_ID,
  AIDOS_ASSISTANT_INSTRUCTIONS,
} from "./aidos-assistant";

export {
  DRYDOCK_ASSISTANT_ID,
  DRYDOCK_ASSISTANT_INSTRUCTIONS,
} from "./drydock-assistant";
