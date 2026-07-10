import type { AgentChatStreamChunkKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { readJsonField } from "@/lib/json-field";
import type { ReasoningJson, StreamChunkSsePayload } from "./types";
import { buildReasoningJson } from "./types";

export type { ReasoningJson, StreamChunkSsePayload } from "./types";
export { parseReasoningJson } from "./types";

const CHUNK_TTL_HOURS = Number(process.env.AGENT_CHAT_STREAM_CHUNK_TTL_HOURS ?? "24");

function chunkTtlCutoff(): Date {
  return new Date(Date.now() - CHUNK_TTL_HOURS * 3600_000);
}

export class ChatStreamSession {
  private sequence = 0;
  private accumulatedText = "";
  private thinking = "";
  private tools: ReasoningJson["tools"] = [];
  private openToolIndex = -1;

  constructor(
    readonly organizationId: string,
    readonly threadId: string,
    readonly runId: string,
    readonly agentId: string,
    readonly messageId: string,
  ) {}

  get accumulatedContent(): string {
    return this.accumulatedText;
  }

  async emitTextDelta(text: string): Promise<void> {
    if (!text) return;
    this.accumulatedText += text;
    await this.persistChunk("text_delta", { text });
  }

  async emitThinkingDelta(thinking: string): Promise<void> {
    if (!thinking) return;
    this.thinking += thinking;
    await this.persistChunk("thinking_delta", { thinking });
  }

  async emitToolStart(name: string, input: Record<string, unknown>): Promise<void> {
    this.tools.push({
      name,
      input,
      startedAt: new Date().toISOString(),
    });
    this.openToolIndex = this.tools.length - 1;
    await this.persistChunk("tool_start", { tool: name, input });
  }

  async emitToolEnd(name: string, outputPreview: string): Promise<void> {
    const idx =
      this.openToolIndex >= 0 ? this.openToolIndex : this.tools.findLastIndex((t) => t.name === name);
    if (idx >= 0) {
      this.tools[idx] = {
        ...this.tools[idx],
        endedAt: new Date().toISOString(),
        outputPreview: outputPreview.slice(0, 500),
      };
    }
    this.openToolIndex = -1;
    await this.persistChunk("tool_end", {
      tool: name,
      outputPreview: outputPreview.slice(0, 500),
    });
  }

  async emitRunComplete(): Promise<void> {
    await this.persistChunk("run_complete", {});
  }

  async emitRunError(error: string): Promise<void> {
    await this.persistChunk("run_error", { error: error.slice(0, 500) });
  }

  reasoningJsonString(): string {
    return buildReasoningJson({ thinking: this.thinking, tools: this.tools });
  }

  async finalize(input: {
    contentMarkdown?: string;
    error?: string;
  }): Promise<{ messageId: string }> {
    const content =
      input.contentMarkdown?.trim() ||
      this.accumulatedText.trim() ||
      (input.error ? `I could not complete this request: ${input.error}` : "");

    const reasoningJson = this.reasoningJsonString();

    await prisma.$transaction(async (tx) => {
      const existing = await tx.agentChatMessage.findFirst({
        where: { organizationId: this.organizationId, runId: this.runId },
      });

      if (existing) {
        const updates: { contentMarkdown?: string; reasoningJson: string } = {
          reasoningJson,
        };
        if (content && !existing.contentMarkdown.trim()) {
          updates.contentMarkdown = content.slice(0, 8000);
        } else if (content && existing.contentMarkdown.trim() !== content.trim()) {
          // Tool-posted content takes precedence; only fill reasoning.
        }
        await tx.agentChatMessage.update({
          where: { id: existing.id },
          data: updates,
        });
      } else if (content) {
        await tx.agentChatMessage.create({
          data: {
            organizationId: this.organizationId,
            threadId: this.threadId,
            kind: "agent_reply",
            contentMarkdown: content.slice(0, 8000),
            reasoningJson,
            authorAgentId: this.agentId,
            runId: this.runId,
          },
        });
        await tx.agentChatThread.update({
          where: { id: this.threadId },
          data: { status: "active", updatedAt: new Date() },
        });
      }
    });

    return { messageId: this.messageId };
  }

  private async persistChunk(
    kind: AgentChatStreamChunkKind,
    payload: Record<string, unknown>,
  ): Promise<string> {
    this.sequence += 1;
    const chunk = await prisma.agentChatStreamChunk.create({
      data: {
        organizationId: this.organizationId,
        threadId: this.threadId,
        runId: this.runId,
        messageId: this.messageId,
        sequence: this.sequence,
        kind,
        payloadJson: JSON.stringify(payload),
      },
    });
    return chunk.id;
  }
}

export async function createChatStreamSession(input: {
  organizationId: string;
  threadId: string;
  runId: string;
  agentId: string;
}): Promise<ChatStreamSession | null> {
  const thread = await prisma.agentChatThread.findFirst({
    where: { id: input.threadId, organizationId: input.organizationId },
  });
  if (!thread) return null;

  const existing = await prisma.agentChatMessage.findFirst({
    where: { organizationId: input.organizationId, runId: input.runId },
  });
  if (existing) {
    return new ChatStreamSession(
      input.organizationId,
      input.threadId,
      input.runId,
      input.agentId,
      existing.id,
    );
  }

  const message = await prisma.agentChatMessage.create({
    data: {
      organizationId: input.organizationId,
      threadId: input.threadId,
      kind: "agent_reply",
      contentMarkdown: "",
      authorAgentId: input.agentId,
      runId: input.runId,
    },
  });

  return new ChatStreamSession(
    input.organizationId,
    input.threadId,
    input.runId,
    input.agentId,
    message.id,
  );
}

export function formatChunkForSse(
  chunk: {
    id: string;
    runId: string;
    messageId: string | null;
    kind: AgentChatStreamChunkKind;
    payloadJson: unknown;
  },
  agentId: string,
): StreamChunkSsePayload {
  const payload = readJsonField<Record<string, unknown>>(chunk.payloadJson, {});

  return {
    runId: chunk.runId,
    agentId,
    messageId: chunk.messageId ?? undefined,
    kind: chunk.kind,
    text: typeof payload.text === "string" ? payload.text : undefined,
    thinking: typeof payload.thinking === "string" ? payload.thinking : undefined,
    tool: typeof payload.tool === "string" ? payload.tool : undefined,
    input:
      payload.input && typeof payload.input === "object"
        ? (payload.input as Record<string, unknown>)
        : undefined,
    outputPreview:
      typeof payload.outputPreview === "string" ? payload.outputPreview : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

export async function getStreamChunksAfter(input: {
  organizationId: string;
  threadId: string;
  afterChunkId?: string | null;
  limit?: number;
}) {
  const { organizationId, threadId, afterChunkId, limit = 100 } = input;

  let afterSequence = 0;
  let afterCreatedAt: Date | undefined;

  if (afterChunkId) {
    const cursor = await prisma.agentChatStreamChunk.findFirst({
      where: { id: afterChunkId, organizationId, threadId },
    });
    if (cursor) {
      afterSequence = cursor.sequence;
      afterCreatedAt = cursor.createdAt;
    }
  }

  return prisma.agentChatStreamChunk.findMany({
    where: {
      organizationId,
      threadId,
      ...(afterCreatedAt
        ? {
            OR: [
              { sequence: { gt: afterSequence } },
              { sequence: afterSequence, createdAt: { gt: afterCreatedAt } },
            ],
          }
        : {}),
    },
    orderBy: [{ runId: "asc" }, { sequence: "asc" }],
    take: limit,
  });
}

export async function getRunAgentIdMap(
  organizationId: string,
  runIds: string[],
): Promise<Map<string, string>> {
  if (runIds.length === 0) return new Map();

  const runs = await prisma.agentHeartbeatRun.findMany({
    where: { organizationId, id: { in: runIds } },
    select: { id: true, agentId: true },
  });

  return new Map(runs.map((run) => [run.id, run.agentId]));
}

export async function purgeStaleStreamChunks(): Promise<number> {
  const cutoff = chunkTtlCutoff();
  const result = await prisma.agentChatStreamChunk.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

export function sseHeartbeatIntervalMs(): number {
  const sec = Number(process.env.AGENT_CHAT_SSE_HEARTBEAT_SEC ?? "15");
  return Math.max(5, sec) * 1000;
}
