export type LlmProviderMode = "anthropic" | "rule-engine";

export type LlmToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type LlmRunResult = {
  summary: string;
  inputTokens: number;
  outputTokens: number;
  mode: LlmProviderMode;
};

export type LlmStreamEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "thinking_delta"; thinking: string }
  | { kind: "tool_start"; tool: string; input: Record<string, unknown> }
  | { kind: "tool_end"; tool: string; outputPreview: string };

export type AnthropicConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};
