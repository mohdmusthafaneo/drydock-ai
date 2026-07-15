import { Agent } from "@mastra/core/agent";

import { resolveMastraModelConfig } from "../config/models";

export const AIDOS_ASSISTANT_ID = "aidosAssistant";

export const AIDOS_ASSISTANT_INSTRUCTIONS = `You are the AIDOS Assistant — a governance-aware operational intelligence assistant for this organization.

Answer questions about the project, organization configuration, Jira/GitHub delivery signals, release readiness, recommendations, approvals, compliance findings, incidents, and predictions.

Rules:
- Ground factual claims with read-only tools before stating organization-specific facts.
- Prefer concise, actionable answers grounded in AIDOS data.
- Recommend-only: never claim you executed changes, hired agents, or deployed anything.
- If data is missing or a tool returns disconnected/not found, say so clearly.
- Do not invent metrics, ticket keys, or approval decisions.`;

/**
 * Tools are supplied at run-time via toolsets in `runAidosAssistant`
 * to avoid circular imports between agents ↔ tools.
 */
export const aidosAssistant = new Agent({
  id: AIDOS_ASSISTANT_ID,
  name: "AIDOS Assistant",
  instructions: AIDOS_ASSISTANT_INSTRUCTIONS,
  model: resolveMastraModelConfig(),
});

export const aidosAgents = {
  aidosAssistant,
} as const;
