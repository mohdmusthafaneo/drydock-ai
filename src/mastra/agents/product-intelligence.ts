import { Agent } from "@mastra/core/agent";

import { resolveMastraModelConfig } from "../config/models";

/** Lightweight agent for Delivery DNA and MVP Accelerator LLM enrichment (no AIDOS tools). */
export const productIntelligenceAgent = new Agent({
  id: "productIntelligenceAgent",
  name: "productIntelligenceAgent",
  instructions: `You are the AIDOS product intelligence assistant.

Enrich delivery narratives and MVP artifacts with concise, governance-aware language.
Recommend-only posture: never suggest bypassing human approval or automated production changes.
Respond with valid JSON when asked for structured output.`,
  model: resolveMastraModelConfig(),
});
