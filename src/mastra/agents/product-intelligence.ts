import { Agent } from "@mastra/core/agent";

import { resolveMastraModelConfig } from "../config/models";

/** Lightweight agent for executive briefing and narrative polish (no AIDOS tools). */
export const productIntelligenceAgent = new Agent({
  id: "productIntelligenceAgent",
  name: "productIntelligenceAgent",
  instructions: `You are the AIDOS product intelligence assistant.

Enrich delivery narratives with concise, governance-aware diagnostic language for senior leadership.
Recommend-only posture: never suggest bypassing human approval or automated production changes.
Respond with valid JSON when asked for structured output.
Never invent numbers, release names, or counts — only use facts provided in the prompt.`,
  model: resolveMastraModelConfig(),
});
