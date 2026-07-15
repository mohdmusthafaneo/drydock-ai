import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logChatActivity, logChatAudit } from "./audit";
import {
  DEFAULT_THREAD_LIST_LIMIT,
  OPEN_THREAD_STATUSES,
  truncateThreadTitle,
  type AgentChatThreadDetail,
  type AgentChatThreadSummary,
  type CreateHumanMessageResult,
  type ThreadListStatusFilter,
} from "./types";

export type CreateThreadInput = {
  organizationId: string;
  userId: string;
  title?: string;
  initialMessage?: string;
};

export type CreateThreadResult = {
  threadId: string;
  messageId?: string;
};

function statusFilterWhere(
  status: ThreadListStatusFilter,
): { status?: { in: typeof OPEN_THREAD_STATUSES } | "done" } | undefined {
  if (status === "open") return { status: { in: OPEN_THREAD_STATUSES } };
  if (status === "done") return { status: "done" };
  return undefined;
}

export async function createAgentChatThread(
  input: CreateThreadInput,
): Promise<
  | { ok: true; data: CreateThreadResult }
  | { ok: false; error: string }
> {
  const { organizationId, userId, title, initialMessage } = input;

  const resolvedTitle =
    title?.trim() ||
    (initialMessage?.trim()
      ? truncateThreadTitle(initialMessage)
      : "New chat");

  const initialContent = initialMessage?.trim();

  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.agentChatThread.create({
      data: {
        organizationId,
        title: resolvedTitle,
        createdByUserId: userId,
        status: "open",
      },
    });

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.thread.created",
      title: `Agent thread created: ${thread.title}`,
      metadata: { threadId: thread.id, userId },
    });

    await logChatAudit(tx, {
      organizationId,
      userId,
      action: "agent_chat.thread.created",
      entityType: "AgentChatThread",
      entityId: thread.id,
      metadata: { title: thread.title },
    });

    let messageId: string | undefined;

    if (initialContent) {
      const message = await tx.agentChatMessage.create({
        data: {
          organizationId,
          threadId: thread.id,
          kind: "human",
          contentMarkdown: initialContent,
          authorUserId: userId,
        },
      });
      messageId = message.id;

      await logChatActivity(tx, {
        organizationId,
        type: "agent_chat.message.posted",
        title: "Human message posted in agent thread",
        metadata: { threadId: thread.id, messageId: message.id, userId },
      });

      await logChatAudit(tx, {
        organizationId,
        userId,
        action: "agent_chat.message.posted",
        entityType: "AgentChatMessage",
        entityId: message.id,
        metadata: { threadId: thread.id, kind: "human" },
      });
    }

    return { thread, messageId };
  });

  return {
    ok: true,
    data: {
      threadId: result.thread.id,
      messageId: result.messageId,
    },
  };
}

export async function listAgentChatThreads(
  organizationId: string,
  options: {
    status?: ThreadListStatusFilter;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<{ threads: AgentChatThreadSummary[]; nextCursor: string | null }> {
  const limit = Math.min(options.limit ?? DEFAULT_THREAD_LIST_LIMIT, 50);
  const statusWhere = statusFilterWhere(options.status ?? "open");

  let cursorClause: Prisma.AgentChatThreadWhereInput = {};
  if (options.cursor) {
    const cursorThread = await prisma.agentChatThread.findFirst({
      where: { id: options.cursor, organizationId },
      select: { updatedAt: true, id: true },
    });
    if (cursorThread) {
      cursorClause = {
        OR: [
          { updatedAt: { lt: cursorThread.updatedAt } },
          { updatedAt: cursorThread.updatedAt, id: { lt: cursorThread.id } },
        ],
      };
    }
  }

  const threads = await prisma.agentChatThread.findMany({
    where: {
      organizationId,
      ...statusWhere,
      ...cursorClause,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          contentMarkdown: true,
          kind: true,
          createdAt: true,
        },
      },
    },
  });

  const hasMore = threads.length > limit;
  const page = hasMore ? threads.slice(0, limit) : threads;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  return { threads: page, nextCursor };
}

export async function getAgentChatThread(
  organizationId: string,
  threadId: string,
): Promise<AgentChatThreadDetail | null> {
  return prisma.agentChatThread.findFirst({
    where: { id: threadId, organizationId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          authorUser: { select: { id: true, name: true } },
          approval: {
            select: {
              id: true,
              type: true,
              title: true,
              decision: true,
              payloadJson: true,
              recommendation: {
                select: { title: true, requiredRole: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function postHumanChatMessage(input: {
  organizationId: string;
  userId: string;
  threadId: string;
  content: string;
}): Promise<
  | { ok: true; data: CreateHumanMessageResult }
  | { ok: false; error: string; status?: number }
> {
  const { organizationId, userId, threadId, content } = input;
  const trimmed = content.trim();

  if (!trimmed) {
    return { ok: false, error: "Message content is required", status: 400 };
  }

  const thread = await prisma.agentChatThread.findFirst({
    where: { id: threadId, organizationId },
  });

  if (!thread) {
    return { ok: false, error: "Thread not found", status: 404 };
  }

  const wasClosed = thread.status === "done";

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "human",
        contentMarkdown: trimmed,
        authorUserId: userId,
      },
    });

    await tx.agentChatThread.update({
      where: { id: threadId },
      data: wasClosed
        ? { status: "open", closedAt: null, updatedAt: new Date() }
        : { updatedAt: new Date() },
    });

    if (wasClosed) {
      await tx.agentChatMessage.create({
        data: {
          organizationId,
          threadId,
          kind: "system",
          contentMarkdown: "Conversation reopened",
          authorUserId: userId,
        },
      });

      await logChatActivity(tx, {
        organizationId,
        type: "agent_chat.thread.reopened",
        title: "Conversation reopened by human follow-up",
        metadata: { threadId, userId, triggerMessageId: created.id },
      });

      await logChatAudit(tx, {
        organizationId,
        userId,
        action: "agent_chat.thread.reopened",
        entityType: "AgentChatThread",
        entityId: threadId,
        metadata: { source: "human_message" },
      });
    }

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.message.posted",
      title: "Human message posted in agent thread",
      metadata: {
        threadId,
        messageId: created.id,
        userId,
      },
    });

    await logChatAudit(tx, {
      organizationId,
      userId,
      action: "agent_chat.message.posted",
      entityType: "AgentChatMessage",
      entityId: created.id,
      metadata: { threadId, kind: "human" },
    });

    return created;
  });

  return {
    ok: true,
    data: { messageId: message.id },
  };
}
