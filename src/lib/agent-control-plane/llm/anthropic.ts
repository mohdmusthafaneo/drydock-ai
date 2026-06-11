import type {
  AnthropicConfig,
  LlmRunResult,
  LlmStreamEvent,
  LlmToolDefinition,
} from "./types";

const MAX_API_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** MiniMax and other Anthropic-compatible providers return transient 5xx / api_error bodies. */
function isRetryableApiFailure(status: number, body: string): boolean {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 520 || status === 529) {
    return true;
  }
  const lower = body.toLowerCase();
  return (
    lower.includes('"type":"api_error"') ||
    lower.includes("overloaded_error") ||
    lower.includes("request timeout") ||
    lower.includes("520 (1000)") ||
    lower.includes("rate limit")
  );
}

async function postAnthropicMessages(
  config: AnthropicConfig,
  body: Record<string, unknown>,
): Promise<Response> {
  let lastRes: Response | null = null;
  let lastBody = "";

  for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
    const res = await fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return res;

    lastRes = res;
    lastBody = await res.text();

    if (attempt < MAX_API_RETRIES && isRetryableApiFailure(res.status, lastBody)) {
      await sleep(RETRY_BASE_MS * 2 ** attempt);
      continue;
    }

    throw new Error(
      `Anthropic API error: ${res.status} ${lastBody.slice(0, 300)}`,
    );
  }

  throw new Error(
    `Anthropic API error: ${lastRes?.status ?? "unknown"} ${lastBody.slice(0, 300)}`,
  );
}

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
    const res = await postAnthropicMessages(input.config, {
      model: input.config.model,
      max_tokens: 4096,
      system: input.systemPrompt,
      tools: input.tools,
      messages,
      temperature: 0.2,
    });

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

async function postAnthropicMessagesStream(
  config: AnthropicConfig,
  body: Record<string, unknown>,
): Promise<Response> {
  let lastRes: Response | null = null;
  let lastBody = "";

  for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
    const res = await fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (res.ok && res.body) return res;

    lastRes = res;
    lastBody = await res.text();

    if (attempt < MAX_API_RETRIES && isRetryableApiFailure(res.status, lastBody)) {
      await sleep(RETRY_BASE_MS * 2 ** attempt);
      continue;
    }

    throw new Error(
      `Anthropic API error: ${res.status} ${lastBody.slice(0, 300)}`,
    );
  }

  throw new Error(
    `Anthropic API error: ${lastRes?.status ?? "unknown"} ${lastBody.slice(0, 300)}`,
  );
}

type ParsedSseEvent = {
  type: string;
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  content_block?: {
    type: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
};

async function* parseAnthropicSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ParsedSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLine = block
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (dataLine) {
        const raw = dataLine.slice(6).trim();
        if (raw && raw !== "[DONE]") {
          try {
            yield JSON.parse(raw) as ParsedSseEvent;
          } catch {
            // skip malformed event
          }
        }
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
}

type RoundContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    };

export async function runAnthropicWithToolsStreaming(input: {
  config: AnthropicConfig;
  systemPrompt: string;
  userMessage: string;
  tools: LlmToolDefinition[];
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<string>;
  maxRounds?: number;
  onStreamEvent?: (event: LlmStreamEvent) => void | Promise<void>;
}): Promise<LlmRunResult> {
  const messages: AnthropicMessage[] = [
    { role: "user", content: input.userMessage },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let lastText = "";
  const maxRounds = input.maxRounds ?? 15;

  const emit = async (event: LlmStreamEvent) => {
    await input.onStreamEvent?.(event);
  };

  for (let round = 0; round < maxRounds; round++) {
    const res = await postAnthropicMessagesStream(input.config, {
      model: input.config.model,
      max_tokens: 4096,
      system: input.systemPrompt,
      tools: input.tools,
      messages,
      temperature: 0.2,
    });

    const contentBlocks: RoundContentBlock[] = [];
    const toolInputJson: Record<number, string> = {};
    let stopReason: string | null = null;
    const roundTextParts: string[] = [];

    for await (const event of parseAnthropicSse(res.body!)) {
      if (event.type === "message_start" && event.message?.usage) {
        inputTokens += event.message.usage.input_tokens ?? 0;
      }
      if (event.type === "message_delta") {
        if (event.usage?.output_tokens) {
          outputTokens += event.usage.output_tokens;
        }
        if (event.delta?.stop_reason) {
          stopReason = event.delta.stop_reason;
        }
      }

      if (event.type === "content_block_start" && event.content_block) {
        const block = event.content_block;
        if (block.type === "text") {
          contentBlocks[event.index ?? contentBlocks.length] = { type: "text", text: "" };
        } else if (block.type === "tool_use" && block.id && block.name) {
          contentBlocks[event.index ?? contentBlocks.length] = {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input ?? {},
          };
          toolInputJson[event.index ?? 0] = "";
          await emit({
            kind: "tool_start",
            tool: block.name,
            input: block.input ?? {},
          });
        }
      }

      if (event.type === "content_block_delta" && event.delta) {
        const idx = event.index ?? 0;
        if (event.delta.type === "text_delta" && event.delta.text) {
          const existing = contentBlocks[idx];
          if (existing?.type === "text") {
            existing.text += event.delta.text;
          } else {
            contentBlocks[idx] = { type: "text", text: event.delta.text };
          }
          roundTextParts.push(event.delta.text);
          await emit({ kind: "text_delta", text: event.delta.text });
        }
        if (event.delta.type === "thinking_delta" && event.delta.thinking) {
          await emit({ kind: "thinking_delta", thinking: event.delta.thinking });
        }
        if (event.delta.type === "input_json_delta" && event.delta.partial_json) {
          toolInputJson[idx] = (toolInputJson[idx] ?? "") + event.delta.partial_json;
        }
      }

      if (event.type === "content_block_stop") {
        const idx = event.index ?? 0;
        const block = contentBlocks[idx];
        if (block?.type === "tool_use" && toolInputJson[idx]) {
          try {
            block.input = JSON.parse(toolInputJson[idx]) as Record<string, unknown>;
          } catch {
            block.input = {};
          }
        }
      }
    }

    lastText = roundTextParts.join("").trim() || lastText;

    const toolUses = contentBlocks.filter(
      (block): block is Extract<RoundContentBlock, { type: "tool_use" }> =>
        block?.type === "tool_use",
    );

    const assistantContent: AnthropicContentBlock[] = contentBlocks
      .filter(Boolean)
      .map((block) => {
        if (block.type === "text") {
          return { type: "text" as const, text: block.text };
        }
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: block.input,
        };
      });

    if (toolUses.length === 0 || stopReason !== "tool_use") {
      return {
        summary: lastText || "Heartbeat completed.",
        inputTokens,
        outputTokens,
        mode: "anthropic",
      };
    }

    messages.push({ role: "assistant", content: assistantContent });

    const toolResults: AnthropicContentBlock[] = [];
    for (const toolUse of toolUses) {
      const result = await input.executeTool(toolUse.name, toolUse.input ?? {});
      await emit({
        kind: "tool_end",
        tool: toolUse.name,
        outputPreview: result.slice(0, 500),
      });
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
