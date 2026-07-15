import { prisma } from "@/lib/prisma";
import { asJsonInput } from "@/lib/json-field";
import { logChatActivity, logChatAudit } from "./audit";

export type PostAssistantMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/** Persist an assistant reply for a chat thread. */
export async function postAssistantChatMessage(input: {
  organizationId: string;
  threadId: string;
  contentMarkdown: string;
  reasoningJson?: string;
}): Promise<PostAssistantMessageResult> {
  const { organizationId, threadId, contentMarkdown, reasoningJson } = input;
  const trimmed = contentMarkdown.trim();

  if (!trimmed) {
    return { ok: false, error: "Message content is required" };
  }

  const thread = await prisma.agentChatThread.findFirst({
    where: { id: threadId, organizationId },
  });
  if (!thread) {
    return { ok: false, error: "Thread not found" };
  }
  if (thread.status === "done") {
    return { ok: false, error: "Thread is closed" };
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "assistant",
        contentMarkdown: trimmed.slice(0, 8000),
        ...(reasoningJson
          ? { reasoningJson: asJsonInput(reasoningJson) }
          : {}),
      },
    });

    await tx.agentChatThread.update({
      where: { id: threadId },
      data: { status: "open", updatedAt: new Date() },
    });

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.message.posted",
      title: "Assistant reply posted in thread",
      metadata: { threadId, messageId: created.id },
    });

    await logChatAudit(tx, {
      organizationId,
      action: "agent_chat.message.posted",
      entityType: "AgentChatMessage",
      entityId: created.id,
      metadata: { threadId, kind: "assistant" },
    });

    return created;
  });

  return { ok: true, messageId: message.id };
}
