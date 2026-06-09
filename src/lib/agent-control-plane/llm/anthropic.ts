import type { AnthropicConfig, LlmRunResult, LlmToolDefinition } from "./types";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicResponse = {
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  usage?: { input_tokens: number; output_tokens: number };
};

export async function runAnthropicWithTools(input: {
  config: AnthropicConfig;
  systemPrompt: string;
  userMessage: string;
  tools: LlmToolDefinition[];
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<string>;
  maxRounds?: number;
}): Promise<LlmRunResult> {
  const messages: AnthropicMessage[] = [
    { role: "user", content: input.userMessage },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let lastText = "";
  const maxRounds = input.maxRounds ?? 15;

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(`${input.config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": input.config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.config.model,
        max_tokens: 4096,
        system: input.systemPrompt,
        tools: input.tools,
        messages,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Anthropic API error: ${res.status} ${errText.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as AnthropicResponse;
    inputTokens += data.usage?.input_tokens ?? 0;
    outputTokens += data.usage?.output_tokens ?? 0;

    const textBlocks = data.content.filter(
      (block): block is { type: "text"; text: string } => block.type === "text",
    );
    lastText = textBlocks.map((b) => b.text).join("\n").trim();

    const toolUses = data.content.filter(
      (
        block,
      ): block is {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      } => block.type === "tool_use",
    );

    if (toolUses.length === 0 || data.stop_reason !== "tool_use") {
      return {
        summary: lastText || "Heartbeat completed.",
        inputTokens,
        outputTokens,
        mode: "anthropic",
      };
    }

    messages.push({ role: "assistant", content: data.content });

    const toolResults: AnthropicContentBlock[] = [];
    for (const toolUse of toolUses) {
      const result = await input.executeTool(toolUse.name, toolUse.input ?? {});
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    summary: lastText || "Heartbeat reached maximum tool rounds.",
    inputTokens,
    outputTokens,
    mode: "anthropic",
  };
}
