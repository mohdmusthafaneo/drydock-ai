import type { ChunkType } from "@mastra/core/stream";
import type { ChatStreamSession } from "@/lib/agent-chat/stream";

type ToolCallState = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
};

function previewToolOutput(result: unknown): string {
  if (typeof result === "string") return result.slice(0, 500);
  try {
    return JSON.stringify(result).slice(0, 500);
  } catch {
    return String(result).slice(0, 500);
  }
}

/** Map Mastra fullStream chunks to AgentChatStreamChunk kinds. */
export async function bridgeMastraStreamToChatSession(
  fullStream: ReadableStream<ChunkType<unknown>>,
  session: ChatStreamSession,
): Promise<void> {
  const reader = fullStream.getReader();
  const openTools = new Map<string, ToolCallState>();

  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      if (!chunk || typeof chunk !== "object" || !("type" in chunk)) continue;

      switch (chunk.type) {
        case "text-delta": {
          const text =
            "payload" in chunk &&
            chunk.payload &&
            typeof chunk.payload === "object" &&
            "text" in chunk.payload &&
            typeof chunk.payload.text === "string"
              ? chunk.payload.text
              : "";
          if (text) await session.emitTextDelta(text);
          break;
        }
        case "reasoning-delta": {
          const thinking =
            "payload" in chunk &&
            chunk.payload &&
            typeof chunk.payload === "object" &&
            "text" in chunk.payload &&
            typeof chunk.payload.text === "string"
              ? chunk.payload.text
              : "";
          if (thinking) await session.emitThinkingDelta(thinking);
          break;
        }
        case "tool-call": {
          const payload =
            "payload" in chunk && chunk.payload && typeof chunk.payload === "object"
              ? (chunk.payload as {
                  toolCallId?: string;
                  toolName?: string;
                  args?: Record<string, unknown>;
                })
              : {};
          const toolCallId = payload.toolCallId ?? "";
          const toolName = payload.toolName ?? "unknown_tool";
          const args = payload.args ?? {};
          if (toolCallId) {
            openTools.set(toolCallId, { toolCallId, toolName, args });
          }
          await session.emitToolStart(toolName, args);
          break;
        }
        case "tool-result": {
          const payload =
            "payload" in chunk && chunk.payload && typeof chunk.payload === "object"
              ? (chunk.payload as {
                  toolCallId?: string;
                  toolName?: string;
                  result?: unknown;
                })
              : {};
          const toolCallId = payload.toolCallId ?? "";
          const tracked = toolCallId ? openTools.get(toolCallId) : undefined;
          const toolName =
            payload.toolName ?? tracked?.toolName ?? "unknown_tool";
          await session.emitToolEnd(toolName, previewToolOutput(payload.result));
          if (toolCallId) openTools.delete(toolCallId);
          break;
        }
        default:
          break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
