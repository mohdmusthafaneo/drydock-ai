export type AnthropicConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.minimax.io/anthropic";
const DEFAULT_MODEL = "MiniMax-M3";

export function resolveAnthropicConfig(
  adapterConfigJson: string,
): AnthropicConfig {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(adapterConfigJson) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const envModel = process.env.ANTHROPIC_MODEL?.trim();
  const configModel =
    typeof parsed.llmModel === "string" ? parsed.llmModel.trim() : "";

  const model = envModel || configModel || DEFAULT_MODEL;
  const baseUrl = (
    process.env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_ANTHROPIC_BASE_URL
  ).replace(/\/$/, "");
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

  return { apiKey, baseUrl, model };
}

export function assertAnthropicConfigured(config: AnthropicConfig): void {
  if (!config.apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for LLM heartbeats — no rule-engine fallback",
    );
  }
  if (!config.model) {
    throw new Error(
      "ANTHROPIC_MODEL or adapterConfigJson.llmModel is required for LLM heartbeats",
    );
  }
}

export function resolveAidosApiBaseUrl(): string {
  const url =
    process.env.AIDOS_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}
