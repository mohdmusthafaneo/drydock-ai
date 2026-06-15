import type { AgentChatExternalSource } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { findSuperAgent } from "@/lib/agent-control-plane/delegation";
import { enqueueWakeup, isAgentRunnable } from "@/lib/agent-control-plane/wakeup";
import { logChatActivity, logChatAudit } from "@/lib/agent-chat/audit";
import { truncateThreadTitle, type ChatWakeupPayload } from "@/lib/agent-chat/types";
import { isAgentThreadIngressMastraEnabled } from "@/lib/mastra-feature-flags";
import { getMastra } from "@/mastra";

export type ThreadIngressInput = {
  organizationId: string;
  externalSource: AgentChatExternalSource;
  externalChannelId: string;
  externalThreadId: string;
  authorExternalId: string;
  content: string;
  title?: string;
  targetAgentId?: string;
};

export type ThreadIngressResult = {
  threadId: string;
  messageId: string;
  created: boolean;
  wakeupId?: string;
  coalesced?: boolean;
  mastraInvoked?: boolean;
};

export async function handleAgentThreadIngress(
  input: ThreadIngressInput,
): Promise<
  | { ok: true; data: ThreadIngressResult }
  | { ok: false; error: string; status: number }
> {
  const trimmed = input.content.trim();
  if (!trimmed) {
    return { ok: false, error: "Message content is required", status: 400 };
  }

  if (input.externalSource === "web") {
    return {
      ok: false,
      error: "Use session-authenticated routes for web threads",
      status: 400,
    };
  }

  const superAgent = await findSuperAgent(input.organizationId);
  if (!superAgent) {
    return {
      ok: false,
      error: "Super Agent is not configured for this organization",
      status: 503,
    };
  }

  const existing = await prisma.agentChatThread.findFirst({
    where: {
      organizationId: input.organizationId,
      externalSource: input.externalSource,
      externalThreadId: input.externalThreadId,
    },
  });

  let threadId: string;
  let created = false;

  if (existing) {
    threadId = existing.id;
  } else {
    created = true;
    const title =
      input.title?.trim() ||
      truncateThreadTitle(trimmed) ||
      `${input.externalSource} thread`;

    const thread = await prisma.$transaction(async (tx) => {
      const row = await tx.agentChatThread.create({
        data: {
          organizationId: input.organizationId,
          title,
          status: "open",
          externalSource: input.externalSource,
          externalChannelId: input.externalChannelId,
          externalThreadId: input.externalThreadId,
        },
      });

      await tx.agentChatParticipant.create({
        data: {
          organizationId: input.organizationId,
          threadId: row.id,
          role: "coordinator",
          agentId: superAgent.id,
        },
      });

      await logChatActivity(tx, {
        organizationId: input.organizationId,
        type: "agent_chat.thread.created",
        title: `External thread created (${input.externalSource})`,
        metadata: {
          threadId: row.id,
          externalSource: input.externalSource,
          externalThreadId: input.externalThreadId,
          authorExternalId: input.authorExternalId,
        },
      });

      await logChatAudit(tx, {
        organizationId: input.organizationId,
        action: "agent_chat.thread.created",
        entityType: "AgentChatThread",
        entityId: row.id,
        metadata: {
          externalSource: input.externalSource,
          externalChannelId: input.externalChannelId,
          externalThreadId: input.externalThreadId,
        },
      });

      return row;
    });

    threadId = thread.id;
  }

  const message = await prisma.$transaction(async (tx) => {
    const row = await tx.agentChatMessage.create({
      data: {
        organizationId: input.organizationId,
        threadId,
        kind: "human",
        contentMarkdown: trimmed.slice(0, 8000),
        authorUserId: null,
        targetAgentId: input.targetAgentId ?? null,
      },
    });

    await tx.agentChatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    await logChatActivity(tx, {
      organizationId: input.organizationId,
      type: "agent_chat.message.posted",
      title: "External message posted in agent thread",
      metadata: {
        threadId,
        messageId: row.id,
        externalSource: input.externalSource,
        authorExternalId: input.authorExternalId,
      },
    });

    await logChatAudit(tx, {
      organizationId: input.organizationId,
      action: "agent_chat.message.posted",
      entityType: "AgentChatMessage",
      entityId: row.id,
      metadata: {
        threadId,
        kind: "human",
        externalSource: input.externalSource,
        authorExternalId: input.authorExternalId,
      },
    });

    return row;
  });

  let wakeupId: string | undefined;
  let coalesced = false;
  let mastraInvoked = false;

  if (isAgentRunnable(superAgent.status)) {
    const payload: ChatWakeupPayload = {
      threadId,
      triggerMessageId: message.id,
      ...(input.targetAgentId ? { targetAgentId: input.targetAgentId } : {}),
    };

    const wakeup = await enqueueWakeup({
      organizationId: input.organizationId,
      agentId: superAgent.id,
      source: "chat",
      reason: created ? "chat.human_message" : "chat.human_message",
      payload,
      idempotencyKey: `chat:${threadId}:${message.id}`,
    });

    if (wakeup.ok) {
      wakeupId = wakeup.wakeupId;
      coalesced = wakeup.coalesced;
    }

    if (isAgentThreadIngressMastraEnabled()) {
      mastraInvoked = await verifyChatRoutingWorkflowBinding();
    }
  }

  return {
    ok: true,
    data: {
      threadId,
      messageId: message.id,
      created,
      wakeupId,
      coalesced,
      mastraInvoked,
    },
  };
}

/**
 * Stub: confirm chatRoutingWorkflow is registered on Mastra.
 * Execution happens via enqueued worker wakeup → runMastraAdapter → chatRoutingWorkflow.
 */
async function verifyChatRoutingWorkflowBinding(): Promise<boolean> {
  try {
    const mastra = await getMastra();
    return Boolean(mastra.getWorkflow("chatRoutingWorkflow"));
  } catch (err) {
    console.warn("[ingress] chatRoutingWorkflow binding check failed:", err);
    return false;
  }
}
