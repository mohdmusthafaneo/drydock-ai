import type { MastraModelConfig } from "@mastra/core/llm";

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.minimax.io/anthropic";
const DEFAULT_MODEL_ID = "MiniMax-M3";

/** Mastra createAnthropic appends `/messages`; MiniMax expects `/v1/messages`. */
export function normalizeAnthropicBaseUrlForMastra(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

/**
 * Maps ANTHROPIC_* env vars to a Mastra model-router config.
 *
 * Do not set `url` on the config — Mastra treats custom urls as OpenAI-compatible.
 * The gateway uses createAnthropic with ANTHROPIC_BASE_URL + `/messages`.
 */
export function resolveMastraModelConfig(): MastraModelConfig {
  const modelId = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL_ID;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

  const rawBase =
    process.env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_ANTHROPIC_BASE_URL;
  process.env.ANTHROPIC_BASE_URL = normalizeAnthropicBaseUrlForMastra(rawBase);

  return {
    id: `anthropic/${modelId}`,
    apiKey,
  };
}
