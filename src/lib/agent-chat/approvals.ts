import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logChatActivity } from "./audit";

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
      data: { status: "open", updatedAt: new Date() },
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
