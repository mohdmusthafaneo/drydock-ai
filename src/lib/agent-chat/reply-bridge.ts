import { prisma } from "@/lib/prisma";
import { readJsonField } from "@/lib/json-field";
import type { ChatWakeupPayload } from "./types";

/** Fallback: mirror run summary when agent did not call aidos_post_thread_message (idempotent by runId). */
export async function postChatRunReplyIfNeeded(input: {
  organizationId: string;
  agentId: string;
  runId: string;
  wakeupPayloadJson: unknown;
  summary?: string;
  error?: string;
}): Promise<void> {
  const payload = parsePayload(input.wakeupPayloadJson);
  const threadId = payload.threadId;
  if (!threadId) return;

  const existing = await prisma.agentChatMessage.findFirst({
    where: { organizationId: input.organizationId, runId: input.runId },
  });
  if (existing) return;

  const content =
    input.summary?.trim() ||
    (input.error ? `I could not complete this request: ${input.error}` : "");

  if (!content) return;

  await prisma.$transaction(async (tx) => {
    await tx.agentChatMessage.create({
      data: {
        organizationId: input.organizationId,
        threadId,
        kind: "agent_reply",
        contentMarkdown: content.slice(0, 8000),
        authorAgentId: input.agentId,
        runId: input.runId,
      },
    });

    await tx.agentChatThread.update({
      where: { id: threadId },
      data: { status: "active", updatedAt: new Date() },
    });
  });
}

function parsePayload(json: unknown): ChatWakeupPayload & Record<string, unknown> {
  return readJsonField<ChatWakeupPayload & Record<string, unknown>>(json, {} as ChatWakeupPayload & Record<string, unknown>);
}
