import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mergeApprovalPayload } from "@/lib/approvals/chat-context";
import { enqueueWakeup, isAgentRunnable } from "@/lib/agent-control-plane/wakeup";
import { logChatActivity, logChatAudit } from "./audit";
import { isAgentThreadParticipant } from "./participants";

const requestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  rationale: z.string().max(4000).optional(),
  action: z.string().min(1).max(100),
  requiredRole: z
    .enum(["QA_LEAD", "DEVOPS_LEAD", "ENGINEERING_MANAGER", "ORG_ADMIN"])
    .optional(),
  riskScore: z.number().min(0).max(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type RequestThreadApprovalInput = z.infer<typeof requestSchema> & {
  organizationId: string;
  threadId: string;
  agentId: string;
};

export type RequestThreadApprovalResult =
  | { ok: true; approvalId: string; messageId: string }
  | { ok: false; error: string };

export async function requestThreadApproval(
  input: RequestThreadApprovalInput,
): Promise<RequestThreadApprovalResult> {
  const body = requestSchema.parse(input);
  const { organizationId, threadId, agentId } = input;

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
  if (thread.status === "done") return { ok: false, error: "Thread is closed" };

  const isParticipant = await isAgentThreadParticipant(
    organizationId,
    threadId,
    agentId,
  );
  if (!isParticipant) {
    return { ok: false, error: "Agent is not a participant in this thread" };
  }

  const contentMarkdown = [
    `**${agent.displayName}** requests approval — **${body.title}**`,
    "",
    body.description,
    body.rationale ? `\n_${body.rationale}_` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await prisma.$transaction(async (tx) => {
    const approval = await tx.approval.create({
      data: {
        organizationId,
        type: "AGENT_ACTION",
        title: body.title,
        requestedByAgentId: agentId,
        riskScore: body.riskScore ?? 0.5,
        payloadJson: mergeApprovalPayload(
          {
            action: body.action,
            description: body.description,
            rationale: body.rationale,
            requiredRole: body.requiredRole,
            threadId,
            ...(body.payload ?? {}),
          },
          { threadId },
        ),
      },
    });

    const message = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "approval_request",
        contentMarkdown,
        authorAgentId: agentId,
        approvalId: approval.id,
      },
    });

    await tx.approval.update({
      where: { id: approval.id },
      data: {
        payloadJson: mergeApprovalPayload(
          {
            action: body.action,
            description: body.description,
            rationale: body.rationale,
            requiredRole: body.requiredRole,
            threadId,
            ...(body.payload ?? {}),
          },
          { threadId, messageId: message.id },
        ),
      },
    });

    await tx.agentChatThread.update({
      where: { id: threadId },
      data: { status: "awaiting_human", updatedAt: new Date() },
    });

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.approval.requested",
      title: `Approval requested: ${body.title}`,
      metadata: {
        threadId,
        approvalId: approval.id,
        messageId: message.id,
        agentId,
        action: body.action,
      },
    });

    await logChatAudit(tx, {
      organizationId,
      action: "agent_chat.approval.requested",
      entityType: "Approval",
      entityId: approval.id,
      metadata: { threadId, messageId: message.id, agentId },
    });

    return { approvalId: approval.id, messageId: message.id };
  });

  return { ok: true, ...result };
}

export async function postApprovalResolvedMessage(input: {
  organizationId: string;
  threadId: string;
  approvalId: string;
  decision: string;
  approverName?: string;
  tx?: Prisma.TransactionClient;
}): Promise<string | null> {
  const { organizationId, threadId, approvalId, decision, approverName } = input;

  const approval = await (input.tx ?? prisma).approval.findFirst({
    where: { id: approvalId, organizationId },
    include: { recommendation: { select: { title: true } } },
  });

  if (!approval) return null;

  const title =
    approval.title ?? approval.recommendation?.title ?? "Approval request";
  const actor = approverName ?? "A human approver";
  const contentMarkdown = `${actor} **${decision.toLowerCase()}** — ${title}`;

  const run = async (tx: Prisma.TransactionClient) => {
    const message = await tx.agentChatMessage.create({
      data: {
        organizationId,
        threadId,
        kind: "approval_resolved",
        contentMarkdown,
        approvalId,
      },
    });

    await tx.agentChatThread.update({
      where: { id: threadId },
      data: { status: "active", updatedAt: new Date() },
    });

    await logChatActivity(tx, {
      organizationId,
      type: "agent_chat.approval.resolved",
      title: contentMarkdown,
      metadata: { threadId, approvalId, decision, messageId: message.id },
    });

    return message.id;
  };

  return input.tx ? run(input.tx) : prisma.$transaction(run);
}

export async function enqueueThreadApprovalWakeup(input: {
  organizationId: string;
  approvalId: string;
  decision: string;
  threadId: string;
  triggerMessageId: string;
  agentId: string;
}) {
  const { organizationId, approvalId, decision, threadId, triggerMessageId, agentId } =
    input;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id: agentId, organizationId },
  });

  if (!agent || !isAgentRunnable(agent.status)) {
    return { ok: false as const, error: "Agent not runnable" };
  }

  return enqueueWakeup({
    organizationId,
    agentId,
    source: "approval",
    reason: `approval.${decision.toLowerCase()}`,
    payload: {
      approvalId,
      decision,
      threadId,
      triggerMessageId,
    },
    idempotencyKey: `approval:thread:${approvalId}:${decision.toLowerCase()}:${agentId}`,
  });
}
