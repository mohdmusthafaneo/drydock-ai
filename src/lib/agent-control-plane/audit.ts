import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function logAgentActivity(
  tx: Tx,
  input: {
    organizationId: string;
    type: string;
    title: string;
    description?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: input.type,
      title: input.title,
      description: input.description,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    },
  });
}

export async function logAgentAudit(
  tx: Tx,
  input: {
    organizationId: string;
    action: string;
    entityType: string;
    entityId?: string;
    agentId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorType: "agent",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: JSON.stringify({
        ...(input.metadata ?? {}),
        ...(input.agentId ? { actorId: input.agentId } : {}),
      }),
    },
  });
}
