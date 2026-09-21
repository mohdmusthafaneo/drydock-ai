import type { Mastra } from "@mastra/core/mastra";
import type { RequestContext } from "@mastra/core/request-context";
import type { ChunkType } from "@mastra/core/stream";

import {
  DRYDOCK_ASSISTANT_ID,
  DRYDOCK_ASSISTANT_INSTRUCTIONS,
} from "../agents/drydock-assistant";
import type { DrydockAssistantRequestContextValues } from "../tools/drydock-assistant";

export type DrydockAssistantStreamHandlers = {
  onTextDelta?: (text: string) => void | Promise<void>;
  onThinkingDelta?: (text: string) => void | Promise<void>;
  onToolStart?: (
    tool: string,
    input: Record<string, unknown>,
    toolCallId: string,
  ) => void | Promise<void>;
  onToolEnd?: (
    tool: string,
    outputPreview: string | undefined,
    toolCallId: string,
    isError?: boolean,
  ) => void | Promise<void>;
  onError?: (error: string) => void | Promise<void>;
};

export type DrydockAssistantHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RunDrydockAssistantInput = {
  mastra: Mastra;
  userMessage: string;
  history?: DrydockAssistantHistoryMessage[];
  requestContext: RequestContext<DrydockAssistantRequestContextValues>;
  maxSteps?: number;
  handlers?: DrydockAssistantStreamHandlers;
};

export type RunDrydockAssistantResult = {
  summary: string;
  inputTokens: number;
  outputTokens: number;
  mastraRunId?: string;
  mastraTraceId?: string;
};

function usageTotals(usage: {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
} | null | undefined): { inputTokens: number; outputTokens: number } {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: usage.inputTokens ?? usage.promptTokens ?? 0,
    outputTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
  };
}

function previewValue(value: unknown, max = 400): string | undefined {
  if (value == null) return undefined;
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return undefined;
  }
}

/** Run the floating DryDock assistant and optionally stream chunks via handlers. */
export async function runDrydockAssistant(
  input: RunDrydockAssistantInput,
): Promise<RunDrydockAssistantResult> {
  const agent = input.mastra.getAgent(DRYDOCK_ASSISTANT_ID);
  if (!agent) {
    throw new Error(`Mastra agent not found: ${DRYDOCK_ASSISTANT_ID}`);
  }

  const handlers = input.handlers ?? {};
  const startedToolCalls = new Set<string>();
  const finishedToolCalls = new Set<string>();

  const prior = (input.history ?? [])
    .filter((m) => m.content.trim().length > 0)
    .slice(-12)
    .map((m) =>
      m.role === "assistant"
        ? ({ role: "assistant" as const, content: m.content })
        : ({ role: "user" as const, content: m.content }),
    );

  const messages = [
    ...prior,
    { role: "user" as const, content: input.userMessage },
  ];

  const streamOutput = await agent.stream(messages, {
    instructions: DRYDOCK_ASSISTANT_INSTRUCTIONS,
    requestContext: input.requestContext,
    toolChoice: "auto",
    maxSteps: input.maxSteps ?? 12,
  });

  const fullStream = streamOutput.fullStream as ReadableStream<ChunkType<unknown>>;
  const reader = fullStream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || typeof value !== "object") continue;

      const chunk = value as ChunkType<unknown> & {
        type?: string;
        payload?: Record<string, unknown>;
        textDelta?: string;
        text?: string;
        args?: unknown;
        toolName?: string;
        toolCallId?: string;
        result?: unknown;
        error?: unknown;
      };

      const type = String(chunk.type ?? "");
      const payload = chunk.payload ?? {};

      if (
        type === "text-delta" ||
        type === "textDelta" ||
        type === "text-delta-chunk"
      ) {
        const text =
          (typeof payload.text === "string" && payload.text) ||
          (typeof payload.textDelta === "string" && payload.textDelta) ||
          (typeof chunk.textDelta === "string" && chunk.textDelta) ||
          (typeof chunk.text === "string" && chunk.text) ||
          "";
        if (text) await handlers.onTextDelta?.(text);
        continue;
      }

      if (
        type === "reasoning-delta" ||
        type === "reasoningDelta" ||
        type === "thinking-delta" ||
        type === "reasoning" ||
        type === "reasoning-start" ||
        type === "reasoning-end"
      ) {
        const thinking =
          (typeof payload.text === "string" && payload.text) ||
          (typeof payload.delta === "string" && payload.delta) ||
          (typeof payload.reasoning === "string" && payload.reasoning) ||
          (typeof chunk.text === "string" && chunk.text) ||
          "";
        if (thinking) await handlers.onThinkingDelta?.(thinking);
        continue;
      }

      if (type === "tool-call" || type === "tool-call-start") {
        const toolName =
          (typeof payload.toolName === "string" && payload.toolName) ||
          (typeof chunk.toolName === "string" && chunk.toolName) ||
          "tool";
        const toolCallId =
          (typeof payload.toolCallId === "string" && payload.toolCallId) ||
          (typeof chunk.toolCallId === "string" && chunk.toolCallId) ||
          `${toolName}:${startedToolCalls.size}`;
        const args =
          (payload.args as Record<string, unknown> | undefined) ??
          (payload.input as Record<string, unknown> | undefined) ??
          (chunk.args as Record<string, unknown> | undefined) ??
          {};
        if (startedToolCalls.has(toolCallId)) continue;
        startedToolCalls.add(toolCallId);
        await handlers.onToolStart?.(toolName, args, toolCallId);
        continue;
      }

      if (
        type === "tool-result" ||
        type === "tool-call-result" ||
        type === "tool-call-end" ||
        type === "tool-error"
      ) {
        const toolName =
          (typeof payload.toolName === "string" && payload.toolName) ||
          (typeof chunk.toolName === "string" && chunk.toolName) ||
          "tool";
        const toolCallId =
          (typeof payload.toolCallId === "string" && payload.toolCallId) ||
          (typeof chunk.toolCallId === "string" && chunk.toolCallId) ||
          `${toolName}:${finishedToolCalls.size}`;
        if (finishedToolCalls.has(toolCallId)) continue;
        finishedToolCalls.add(toolCallId);
        const isError =
          type === "tool-error" || payload.error != null || chunk.error != null;
        const result =
          payload.result ??
          payload.output ??
          chunk.result ??
          payload.error ??
          chunk.error;
        await handlers.onToolEnd?.(
          toolName,
          previewValue(result),
          toolCallId,
          isError,
        );
        continue;
      }

      if (type === "error" || type === "stream-error") {
        const message =
          (typeof payload.message === "string" && payload.message) ||
          (typeof payload.error === "string" && payload.error) ||
          (typeof chunk.error === "string" && chunk.error) ||
          "DryDock assistant stream error";
        await handlers.onError?.(message);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const full = await streamOutput.getFullOutput();
  const tokens = usageTotals(full.totalUsage ?? full.usage);

  return {
    summary: (full.text || "").slice(0, 8000),
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    mastraRunId: full.runId ?? streamOutput.runId,
    mastraTraceId: full.traceId ?? streamOutput.traceId,
  };
}
