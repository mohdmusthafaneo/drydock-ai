import { prisma } from "@/lib/prisma";
import { logChatActivity, logChatAudit } from "./audit";
import { isAgentThreadParticipant } from "./participants";

export type PostAgentMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function postAgentThreadMessage(input: {
  organizationId: string;
  threadId: string;
  authorAgentId: string;
  contentMarkdown: string;
  runId?: string;
  reasoningJson?: string;
}): Promise<PostAgentMessageResult> {
  const { organizationId, threadId, authorAgentId, contentMarkdown, runId, reasoningJson } =
    input;
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

  const isParticipant = await isAgentThreadParticipant(
    organizationId,
    threadId,
    authorAgentId,
  );
  if (!isParticipant) {
    return { ok: false, error: "Agent is not a participant in this thread" };
  }

  if (runId) {
    const existing = await prisma.agentChatMessage.findFirst({
      where: { organizationId, runId },
    });
    if (existing) {
      const message = await prisma.$transaction(async (tx) => {
        const updated = await tx.agentChatMessage.update({
          where: { id: existing.id },
          data: {
            contentMarkdown: trimmed.slice(0, 8000),
            ...(reasoningJson ? { reasoningJson } : {}),
          },
        });

        const statusUpdate =
          thread.status === "open" ||
          thread.status === "routing" ||
          thread.status === "awaiting_human"
            ? "active"
            : thread.status;

        await tx.agentChatThread.update({
          where: { id: threadId },
          data: { status: statusUpdate, updatedAt: new Date() },
        });

        await logChatActivity(tx, {
          organizationId,
          type: "agent_chat.message.posted",
          title: "Agent reply posted in thread",
          metadata: { threadId, messageId: updated.id, authorAgentId, runId },
        });

        await logChatAudit(tx, {
          organizationId,
          action: "agent_chat.message.posted",
          entityType: "AgentChatMessage",
          entityId: updated.id,
          metadata: { threadId, kind: "agent_reply", authorAgentId },
        });

        return updated;
      });

      return { ok: true, messageId: message.id };
    }
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "agent_reply",
        contentMarkdown: trimmed.slice(0, 8000),
        authorAgentId,
        runId: runId ?? null,
        reasoningJson: reasoningJson ?? "{}",
      },
    });

    const statusUpdate =
      thread.status === "open" ||
      thread.status === "routing" ||
      thread.status === "awaiting_human"
        ? "active"
        : thread.status;

    await tx.agentChatThread.update({
      where: { id: threadId },
      data: { status: statusUpdate, updatedAt: new Date() },
    });

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.message.posted",
      title: "Agent reply posted in thread",
      metadata: { threadId, messageId: created.id, authorAgentId, runId },
    });

    await logChatAudit(tx, {
      organizationId,
      action: "agent_chat.message.posted",
      entityType: "AgentChatMessage",
      entityId: created.id,
      metadata: { threadId, kind: "agent_reply", authorAgentId },
    });

    return created;
  });

  return { ok: true, messageId: message.id };
}
