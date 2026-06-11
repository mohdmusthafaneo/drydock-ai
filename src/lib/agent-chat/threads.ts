import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { findSuperAgent } from "@/lib/agent-control-plane/delegation";
import { enqueueWakeup, isAgentRunnable } from "@/lib/agent-control-plane/wakeup";
import { logChatActivity, logChatAudit } from "./audit";
import { isInvitedSpecialist } from "./participants";
import {
  DEFAULT_THREAD_LIST_LIMIT,
  OPEN_THREAD_STATUSES,
  truncateThreadTitle,
  type AgentChatThreadDetail,
  type AgentChatThreadSummary,
  type ChatWakeupPayload,
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
  wakeupId?: string;
  coalesced?: boolean;
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
  const superAgent = await findSuperAgent(organizationId);

  if (!superAgent) {
    return { ok: false, error: "Super Agent is not configured for this organization" };
  }

  const resolvedTitle =
    title?.trim() ||
    (initialMessage?.trim()
      ? truncateThreadTitle(initialMessage)
      : "New agent thread");

  const initialContent = initialMessage?.trim();

  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.agentChatThread.create({
      data: {
        organizationId,
        title: resolvedTitle,
        createdByUserId: userId,
        status: "open",
        externalSource: "web",
      },
    });

    await tx.agentChatParticipant.create({
      data: {
        organizationId,
        threadId: thread.id,
        role: "coordinator",
        agentId: superAgent.id,
      },
    });

    await tx.agentChatParticipant.create({
      data: {
        organizationId,
        threadId: thread.id,
        role: "human",
        userId,
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
    let wakeupId: string | undefined;
    let coalesced = false;

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

    return { thread, messageId, wakeupId, coalesced };
  });

  if (initialContent && result.messageId && isAgentRunnable(superAgent.status)) {
    const payload: ChatWakeupPayload = {
      threadId: result.thread.id,
      triggerMessageId: result.messageId,
    };
    const wakeup = await enqueueWakeup({
      organizationId,
      agentId: superAgent.id,
      source: "chat",
      reason: "chat.human_message",
      payload,
      idempotencyKey: `chat:${result.thread.id}:${result.messageId}`,
    });
    if (wakeup.ok) {
      result.wakeupId = wakeup.wakeupId;
      result.coalesced = wakeup.coalesced;
    }
  }

  return {
    ok: true,
    data: {
      threadId: result.thread.id,
      messageId: result.messageId,
      wakeupId: result.wakeupId,
      coalesced: result.coalesced,
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
      _count: { select: { messages: true, participants: true } },
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
      participants: {
        orderBy: { invitedAt: "asc" },
        include: {
          agent: { select: { id: true, displayName: true, agentType: true } },
          user: { select: { id: true, name: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          authorUser: { select: { id: true, name: true } },
          authorAgent: { select: { id: true, displayName: true } },
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
  targetAgentId?: string;
}): Promise<
  | { ok: true; data: CreateHumanMessageResult }
  | { ok: false; error: string; status?: number }
> {
  const { organizationId, userId, threadId, content, targetAgentId } = input;
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

  const superAgent = await findSuperAgent(organizationId);
  if (!superAgent) {
    return { ok: false, error: "Super Agent is not configured", status: 503 };
  }

  const message = await prisma.$transaction(async (tx) => {
    await tx.agentChatParticipant.upsert({
      where: {
        threadId_userId: { threadId, userId },
      },
      create: {
        organizationId,
        threadId,
        role: "human",
        userId,
      },
      update: {},
    });

    const created = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "human",
        contentMarkdown: trimmed,
        authorUserId: userId,
        targetAgentId: targetAgentId ?? null,
      },
    });

    const threadStatusUpdate = wasClosed
      ? { status: "active" as const, closedAt: null, updatedAt: new Date() }
      : thread.status === "awaiting_human"
        ? { status: "active" as const, updatedAt: new Date() }
        : { updatedAt: new Date() };

    await tx.agentChatThread.update({
      where: { id: threadId },
      data: threadStatusUpdate,
    });

    if (wasClosed) {
      await tx.agentChatMessage.create({
        data: {
          organizationId,
          threadId,
          kind: "system",
          contentMarkdown: "Thread reopened by human follow-up",
          authorUserId: userId,
        },
      });

      await logChatActivity(tx, {
        organizationId,
        type: "agent_chat.thread.reopened",
        title: "Thread reopened by human follow-up",
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
        targetAgentId,
      },
    });

    await logChatAudit(tx, {
      organizationId,
      userId,
      action: "agent_chat.message.posted",
      entityType: "AgentChatMessage",
      entityId: created.id,
      metadata: { threadId, kind: "human", targetAgentId },
    });

    return created;
  });

  const payload: ChatWakeupPayload = {
    threadId,
    triggerMessageId: message.id,
    ...(targetAgentId ? { targetAgentId } : {}),
  };

  let wakeupAgentId = superAgent.id;
  let wakeupReason = wasClosed ? "chat.human_reopen" : "chat.human_message";

  if (wasClosed) {
    // Closed threads always wake Super Agent to re-coordinate follow-ups.
  } else if (targetAgentId) {
    if (targetAgentId === superAgent.id) {
      return { ok: false, error: "Cannot @mention Super Agent directly", status: 400 };
    }

    const isSpecialist = await isInvitedSpecialist(
      organizationId,
      threadId,
      targetAgentId,
    );
    if (!isSpecialist) {
      return {
        ok: false,
        error: "Target agent is not an invited specialist in this thread",
        status: 400,
      };
    }

    const targetAgent = await prisma.agentRegistry.findFirst({
      where: { id: targetAgentId, organizationId },
    });
    if (!targetAgent || !isAgentRunnable(targetAgent.status)) {
      return {
        ok: true,
        data: { messageId: message.id, wakeupId: null, coalesced: false },
      };
    }

    wakeupAgentId = targetAgentId;
    wakeupReason = "chat.human_mention";
  } else if (!isAgentRunnable(superAgent.status)) {
    return {
      ok: true,
      data: { messageId: message.id, wakeupId: null, coalesced: false },
    };
  }

  const wakeup = await enqueueWakeup({
    organizationId,
    agentId: wakeupAgentId,
    source: "chat",
    reason: wakeupReason,
    payload,
    idempotencyKey: `chat:${threadId}:${message.id}`,
  });

  if (!wakeup.ok) {
    return { ok: false, error: wakeup.error, status: 400 };
  }

  return {
    ok: true,
    data: {
      messageId: message.id,
      wakeupId: wakeup.wakeupId,
      coalesced: wakeup.coalesced,
    },
  };
}
