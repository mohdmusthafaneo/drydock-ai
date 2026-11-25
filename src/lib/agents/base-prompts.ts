import type { AgentKey } from "./keys";
import {
  AIDOS_ASSISTANT_INSTRUCTIONS,
  DEVOPS_AGENT_INSTRUCTIONS,
  DRYDOCK_ASSISTANT_INSTRUCTIONS,
  GOVERNANCE_AGENT_INSTRUCTIONS,
  PRODUCTIVITY_AGENT_INSTRUCTIONS,
  QA_AGENT_INSTRUCTIONS,
} from "./prompt-text";

export {
  AIDOS_ASSISTANT_INSTRUCTIONS,
  DEVOPS_AGENT_INSTRUCTIONS,
  DRYDOCK_ASSISTANT_INSTRUCTIONS,
  GOVERNANCE_AGENT_INSTRUCTIONS,
  PRODUCTIVITY_AGENT_INSTRUCTIONS,
  QA_AGENT_INSTRUCTIONS,
} from "./prompt-text";

const BASE_PROMPTS: Record<AgentKey, string> = {
  productivity: PRODUCTIVITY_AGENT_INSTRUCTIONS,
  qa: QA_AGENT_INSTRUCTIONS,
  governance: GOVERNANCE_AGENT_INSTRUCTIONS,
  devops: DEVOPS_AGENT_INSTRUCTIONS,
  drydockAssistant: DRYDOCK_ASSISTANT_INSTRUCTIONS,
  aidosAssistant: AIDOS_ASSISTANT_INSTRUCTIONS,
};

export function getBaseAgentInstructions(agentKey: AgentKey): string {
  return BASE_PROMPTS[agentKey];
}

/** Append enabled org instruction lines after the hardcoded base runbook. */
export function mergeAgentInstructions(
  base: string,
  orgLines: string[],
): string {
  const cleaned = orgLines.map((line) => line.trim()).filter(Boolean);
  if (cleaned.length === 0) return base;
  return `${base.trimEnd()}\n\n## Organization instructions\n${cleaned.map((line, i) => `${i + 1}. ${line}`).join("\n")}`;
}
