import type { MastraModelConfig } from "@mastra/core/llm";

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.minimax.io/anthropic";
const DEFAULT_MODEL_ID = "MiniMax-M3";

/**
 * Maps existing ANTHROPIC_* env vars to a Mastra model-router compatible config.
 * MiniMax is not in the built-in registry; use OpenAI-compatible shape with custom url.
 */
export function resolveMastraModelConfig(): MastraModelConfig {
  const modelId = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL_ID;
  const baseUrl = (
    process.env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_ANTHROPIC_BASE_URL
  ).replace(/\/$/, "");
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

  return {
    id: `anthropic/${modelId}`,
    url: baseUrl,
    apiKey,
  };
}
