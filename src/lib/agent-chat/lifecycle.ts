import { prisma } from "@/lib/prisma";
import { logChatActivity, logChatAudit } from "./audit";
import { isAgentThreadParticipant } from "./participants";

export type CloseThreadResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export type ReopenThreadResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export type AwaitHumanInputResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

export async function closeAgentChatThread(input: {
  organizationId: string;
  threadId: string;
  closingAgentId: string;
  summaryMarkdown: string;
}): Promise<CloseThreadResult> {
  const { organizationId, threadId, closingAgentId, summaryMarkdown } = input;
  const summary = summaryMarkdown.trim();

  if (!summary) {
    return { ok: false, error: "summaryMarkdown is required" };
  }

  const [thread, agent] = await Promise.all([
    prisma.agentChatThread.findFirst({
      where: { id: threadId, organizationId },
    }),
    prisma.agentRegistry.findFirst({
      where: { id: closingAgentId, organizationId },
    }),
  ]);

  if (!thread) return { ok: false, error: "Thread not found" };
  if (!agent) return { ok: false, error: "Agent not found" };
  if (agent.agentType !== "SUPER_ORCHESTRATOR") {
    return { ok: false, error: "Only Super Agent may close threads" };
  }
  if (thread.status === "done") {
    return { ok: false, error: "Thread is already closed" };
  }

  const isParticipant = await isAgentThreadParticipant(
    organizationId,
    threadId,
    closingAgentId,
  );
  if (!isParticipant) {
    return { ok: false, error: "Agent is not a participant in this thread" };
  }

  const now = new Date();
  const systemContent = `${agent.displayName} marked thread done — ${summary}`;

  const message = await prisma.$transaction(async (tx) => {
    await tx.agentChatThread.update({
      where: { id: threadId },
      data: {
        status: "done",
        contextSummary: summary,
        closedAt: now,
        updatedAt: now,
      },
    });

    const created = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "system",
        contentMarkdown: systemContent,
        authorAgentId: closingAgentId,
      },
    });

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.thread.closed",
      title: systemContent,
      metadata: { threadId, closingAgentId, messageId: created.id },
    });

    await logChatAudit(tx, {
      organizationId,
      action: "agent_chat.thread.closed",
      entityType: "AgentChatThread",
      entityId: threadId,
      metadata: { closingAgentId, summaryLength: summary.length },
    });

    return created;
  });

  return { ok: true, messageId: message.id };
}

export async function reopenAgentChatThread(input: {
  organizationId: string;
  threadId: string;
  reopeningAgentId: string;
}): Promise<ReopenThreadResult> {
  const { organizationId, threadId, reopeningAgentId } = input;

  const [thread, agent] = await Promise.all([
    prisma.agentChatThread.findFirst({
      where: { id: threadId, organizationId },
    }),
    prisma.agentRegistry.findFirst({
      where: { id: reopeningAgentId, organizationId },
    }),
  ]);

  if (!thread) return { ok: false, error: "Thread not found" };
  if (!agent) return { ok: false, error: "Agent not found" };
  if (agent.agentType !== "SUPER_ORCHESTRATOR") {
    return { ok: false, error: "Only Super Agent may reopen threads" };
  }
  if (thread.status !== "done") {
    return { ok: false, error: "Thread is not closed" };
  }

  const isParticipant = await isAgentThreadParticipant(
    organizationId,
    threadId,
    reopeningAgentId,
  );
  if (!isParticipant) {
    return { ok: false, error: "Agent is not a participant in this thread" };
  }

  const systemContent = `${agent.displayName} reopened the thread`;

  const message = await prisma.$transaction(async (tx) => {
    await tx.agentChatThread.update({
      where: { id: threadId },
      data: {
        status: "active",
        closedAt: null,
        updatedAt: new Date(),
      },
    });

    const created = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "system",
        contentMarkdown: systemContent,
        authorAgentId: reopeningAgentId,
      },
    });

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.thread.reopened",
      title: systemContent,
      metadata: { threadId, reopeningAgentId, messageId: created.id },
    });

    await logChatAudit(tx, {
      organizationId,
      action: "agent_chat.thread.reopened",
      entityType: "AgentChatThread",
      entityId: threadId,
      metadata: { reopeningAgentId },
    });

    return created;
  });

  return { ok: true, messageId: message.id };
}

export async function awaitHumanInputOnThread(input: {
  organizationId: string;
  threadId: string;
  agentId: string;
  promptMarkdown?: string;
}): Promise<AwaitHumanInputResult> {
  const { organizationId, threadId, agentId, promptMarkdown } = input;

  const [thread, agent] = await Promise.all([
    prisma.agentChatThread.findFirst({
      where: { id: threadId, organizationId },
    }),
    prisma.agentRegistry.findFirst({
      where: { id: agentId, organizationId },
    }),
  ]);

  if (!thread) return { ok: false, error: "Thread not found" };
  if (!agent) return { ok: false, error: "Agent not found" };
  if (thread.status === "done") {
    return { ok: false, error: "Thread is closed" };
  }

  const isParticipant = await isAgentThreadParticipant(
    organizationId,
    threadId,
    agentId,
  );
  if (!isParticipant) {
    return { ok: false, error: "Agent is not a participant in this thread" };
  }

  const prompt = promptMarkdown?.trim();
  const systemContent = prompt
    ? `${agent.displayName} is waiting for your input — ${prompt}`
    : `${agent.displayName} is waiting for your input`;

  const message = await prisma.$transaction(async (tx) => {
    await tx.agentChatThread.update({
      where: { id: threadId },
      data: { status: "awaiting_human", updatedAt: new Date() },
    });

    const created = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "system",
        contentMarkdown: systemContent,
        authorAgentId: agentId,
      },
    });

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.thread.awaiting_human",
      title: systemContent,
      metadata: { threadId, agentId, messageId: created.id },
    });

    await logChatAudit(tx, {
      organizationId,
      action: "agent_chat.thread.awaiting_human",
      entityType: "AgentChatThread",
      entityId: threadId,
      metadata: { agentId, hasPrompt: Boolean(prompt) },
    });

    return created;
  });

  return { ok: true, messageId: message.id };
}
