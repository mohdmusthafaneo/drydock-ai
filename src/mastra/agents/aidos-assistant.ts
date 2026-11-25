import { Agent } from "@mastra/core/agent";

import { AIDOS_ASSISTANT_INSTRUCTIONS } from "@/lib/agents/prompt-text";
import { resolveMastraModelConfig } from "../config/models";
import { buildAidosSlackChannelConfig } from "../channels/slack";

export const AIDOS_ASSISTANT_ID = "aidosAssistant";

export { AIDOS_ASSISTANT_INSTRUCTIONS };

const slackChannels = buildAidosSlackChannelConfig();

/**
 * Tools are supplied at run-time via toolsets in `runAidosAssistant`
 * to avoid circular imports between agents ↔ tools.
 */
export const aidosAssistant = new Agent({
  id: AIDOS_ASSISTANT_ID,
  name: "DryDock Assistant",
  instructions: AIDOS_ASSISTANT_INSTRUCTIONS,
  model: resolveMastraModelConfig(),
  ...(slackChannels ? { channels: slackChannels } : {}),
});
