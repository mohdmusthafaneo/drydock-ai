import { Agent } from "@mastra/core/agent";

import { DRYDOCK_ASSISTANT_INSTRUCTIONS } from "@/lib/agents/prompt-text";
import { resolveMastraModelConfig } from "../config/models";
import { drydockAssistantTools } from "../tools/drydock-assistant";

export const DRYDOCK_ASSISTANT_ID = "drydockAssistant";

export { DRYDOCK_ASSISTANT_INSTRUCTIONS };

/**
 * Floating DryDock assistant. Separate from aidosAssistant / Conversations.
 * Tools read the same resolveMockSeed / AppData Overview uses.
 */
export const drydockAssistant = new Agent({
  id: DRYDOCK_ASSISTANT_ID,
  name: "DryDock Assistant",
  instructions: DRYDOCK_ASSISTANT_INSTRUCTIONS,
  model: resolveMastraModelConfig(),
  tools: drydockAssistantTools,
});
