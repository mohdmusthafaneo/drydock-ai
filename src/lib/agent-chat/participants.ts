import { prisma } from "@/lib/prisma";
import { logChatActivity, logChatAudit } from "./audit";
import { MAX_SPECIALISTS_PER_THREAD } from "./context";

export type InviteAgentResult =
  | { ok: true; participantId: string; systemMessageId: string }
  | { ok: false; error: string };

export async function inviteAgentToThread(input: {
  organizationId: string;
  threadId: string;
  targetAgentId: string;
  invitingAgentId: string;
}): Promise<InviteAgentResult> {
  const { organizationId, threadId, targetAgentId, invitingAgentId } = input;

  const [thread, inviter, target] = await Promise.all([
    prisma.agentChatThread.findFirst({
      where: { id: threadId, organizationId },
      include: {
        participants: { where: { role: "specialist" } },
      },
    }),
    prisma.agentRegistry.findFirst({
      where: { id: invitingAgentId, organizationId },
    }),
    prisma.agentRegistry.findFirst({
      where: { id: targetAgentId, organizationId },
    }),
  ]);

  if (!thread) return { ok: false, error: "Thread not found" };
  if (!inviter) return { ok: false, error: "Inviting agent not found" };
  if (inviter.agentType !== "SUPER_ORCHESTRATOR") {
    return { ok: false, error: "Only Super Agent may invite specialists" };
  }
  if (!target) return { ok: false, error: "Target agent not found" };
  if (target.agentType === "SUPER_ORCHESTRATOR") {
    return { ok: false, error: "Cannot invite Super Agent as specialist" };
  }

  const existingParticipant = await prisma.agentChatParticipant.findFirst({
    where: { threadId, agentId: targetAgentId },
  });
  if (existingParticipant) {
    return { ok: false, error: "Agent is already a participant" };
  }

  if (thread.participants.length >= MAX_SPECIALISTS_PER_THREAD) {
    return {
      ok: false,
      error: `Thread already has ${MAX_SPECIALISTS_PER_THREAD} specialists`,
    };
  }

  const systemContent = `${inviter.displayName} invited ${target.displayName}`;

  const result = await prisma.$transaction(async (tx) => {
    const participant = await tx.agentChatParticipant.create({
      data: {
        organizationId,
        threadId,
        role: "specialist",
        agentId: targetAgentId,
        invitedByAgentId: invitingAgentId,
      },
    });

    const systemMessage = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "system",
        contentMarkdown: systemContent,
        authorAgentId: invitingAgentId,
      },
    });

    await tx.agentChatThread.update({
      where: { id: threadId },
      data: { status: "routing", updatedAt: new Date() },
    });

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.participant.invited",
      title: systemContent,
      metadata: {
        threadId,
        targetAgentId,
        invitingAgentId,
        participantId: participant.id,
      },
    });

    await logChatAudit(tx, {
      organizationId,
      action: "agent_chat.participant.invited",
      entityType: "AgentChatParticipant",
      entityId: participant.id,
      metadata: { threadId, targetAgentId, invitingAgentId },
    });

    return { participant, systemMessage };
  });

  return {
    ok: true,
    participantId: result.participant.id,
    systemMessageId: result.systemMessage.id,
  };
}

export async function isAgentThreadParticipant(
  organizationId: string,
  threadId: string,
  agentId: string,
): Promise<boolean> {
  const participant = await prisma.agentChatParticipant.findFirst({
    where: { organizationId, threadId, agentId },
  });
  return Boolean(participant);
}

export async function isInvitedSpecialist(
  organizationId: string,
  threadId: string,
  agentId: string,
): Promise<boolean> {
  const participant = await prisma.agentChatParticipant.findFirst({
    where: { organizationId, threadId, agentId, role: "specialist" },
  });
  return Boolean(participant);
}
