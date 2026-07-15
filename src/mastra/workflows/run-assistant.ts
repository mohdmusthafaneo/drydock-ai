import type { Mastra } from "@mastra/core/mastra";
import type { RequestContext } from "@mastra/core/request-context";
import type { ChunkType } from "@mastra/core/stream";

import { AIDOS_ASSISTANT_ID, AIDOS_ASSISTANT_INSTRUCTIONS } from "../agents";
import { getAidosToolsForAssistant } from "../agents/toolsets";
import type { AidosRequestContextValues } from "../tools/aidos/context";

export type AssistantStreamHandlers = {
  onTextDelta?: (text: string) => void | Promise<void>;
  onThinkingDelta?: (text: string) => void | Promise<void>;
  onToolStart?: (tool: string, input: Record<string, unknown>) => void | Promise<void>;
  onToolEnd?: (tool: string, outputPreview?: string) => void | Promise<void>;
  onError?: (error: string) => void | Promise<void>;
};

export type RunAssistantInput = {
  mastra: Mastra;
  organizationId: string;
  systemPrompt?: string;
  userMessage: string;
  requestContext: RequestContext<AidosRequestContextValues>;
  maxSteps?: number;
  handlers?: AssistantStreamHandlers;
};

export type RunAssistantResult = {
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

/**
 * Run the single AIDOS assistant in-process and optionally stream chunks
 * via handlers (for NDJSON/SSE from the chat API route).
 */
export async function runAidosAssistant(
  input: RunAssistantInput,
): Promise<RunAssistantResult> {
  const agent = input.mastra.getAgent(AIDOS_ASSISTANT_ID);
  if (!agent) {
    throw new Error(`Mastra agent not found: ${AIDOS_ASSISTANT_ID}`);
  }

  const handlers = input.handlers ?? {};
  const toolsets = { aidos: getAidosToolsForAssistant() };

  const streamOutput = await agent.stream(
    [{ role: "user" as const, content: input.userMessage }],
    {
      instructions: input.systemPrompt ?? AIDOS_ASSISTANT_INSTRUCTIONS,
      requestContext: input.requestContext,
      toolsets,
      maxSteps: input.maxSteps ?? 25,
    },
  );

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
        type === "thinking-delta"
      ) {
        const thinking =
          (typeof payload.text === "string" && payload.text) ||
          (typeof payload.delta === "string" && payload.delta) ||
          "";
        if (thinking) await handlers.onThinkingDelta?.(thinking);
        continue;
      }

      if (type === "tool-call" || type === "tool-call-input-streaming-start") {
        const toolName =
          (typeof payload.toolName === "string" && payload.toolName) ||
          (typeof chunk.toolName === "string" && chunk.toolName) ||
          "tool";
        const args =
          (payload.args as Record<string, unknown> | undefined) ??
          (chunk.args as Record<string, unknown> | undefined) ??
          {};
        await handlers.onToolStart?.(toolName, args);
        continue;
      }

      if (type === "tool-result" || type === "tool-call-result") {
        const toolName =
          (typeof payload.toolName === "string" && payload.toolName) ||
          (typeof chunk.toolName === "string" && chunk.toolName) ||
          "tool";
        const result = payload.result ?? chunk.result;
        await handlers.onToolEnd?.(toolName, previewValue(result));
        continue;
      }

      if (type === "error" || type === "stream-error") {
        const message =
          (typeof payload.message === "string" && payload.message) ||
          (typeof payload.error === "string" && payload.error) ||
          (typeof chunk.error === "string" && chunk.error) ||
          "Assistant stream error";
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
