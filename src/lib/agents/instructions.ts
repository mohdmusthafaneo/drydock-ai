import { z } from "zod";
import type { AgentInstruction, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { determineActorType } from "@/lib/audit-helpers";
import { getBaseAgentInstructions, mergeAgentInstructions } from "./base-prompts";
import { type AgentKey, isAgentKey, listAgentCatalog } from "./keys";

export const createInstructionSchema = z.object({
  title: z.string().trim().max(120).optional().nullable(),
  content: z.string().trim().min(1).max(8_000),
  enabled: z.boolean().optional(),
});

export const updateInstructionSchema = z.object({
  title: z.string().trim().max(120).optional().nullable(),
  content: z.string().trim().min(1).max(8_000).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const reorderInstructionsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(200),
});

export type AgentInstructionView = {
  id: string;
  agentKey: AgentKey;
  title: string | null;
  content: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function toView(row: AgentInstruction): AgentInstructionView {
  if (!isAgentKey(row.agentKey)) {
    throw new Error(`Unexpected agentKey in store: ${row.agentKey}`);
  }
  return {
    id: row.id,
    agentKey: row.agentKey,
    title: row.title,
    content: row.content,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAgentSummaries(organizationId: string) {
  const grouped = await prisma.agentInstruction.groupBy({
    by: ["agentKey"],
    where: { organizationId },
    _count: { _all: true },
  });
  const enabledGrouped = await prisma.agentInstruction.groupBy({
    by: ["agentKey"],
    where: { organizationId, enabled: true },
    _count: { _all: true },
  });

  const totalByKey = new Map(
    grouped.map((g) => [g.agentKey, g._count._all] as const),
  );
  const enabledByKey = new Map(
    enabledGrouped.map((g) => [g.agentKey, g._count._all] as const),
  );

  return listAgentCatalog().map((entry) => ({
    ...entry,
    instructionCount: totalByKey.get(entry.key) ?? 0,
    enabledInstructionCount: enabledByKey.get(entry.key) ?? 0,
  }));
}

export async function listInstructions(
  organizationId: string,
  agentKey: AgentKey,
): Promise<AgentInstructionView[]> {
  const rows = await prisma.agentInstruction.findMany({
    where: { organizationId, agentKey },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toView);
}

async function nextSortOrder(
  tx: Prisma.TransactionClient,
  organizationId: string,
  agentKey: AgentKey,
): Promise<number> {
  const agg = await tx.agentInstruction.aggregate({
    where: { organizationId, agentKey },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? -1) + 1;
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    userId: string;
    action: string;
    title: string;
    description: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: input.action,
      title: input.title,
      description: input.description,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    },
  });
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      actorType: determineActorType(input.userId, input.action),
      action: input.action,
      entityType: "AgentInstruction",
      entityId: input.entityId,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    },
  });
}

export async function createInstruction(input: {
  organizationId: string;
  userId: string;
  agentKey: AgentKey;
  title?: string | null;
  content: string;
  enabled?: boolean;
}): Promise<AgentInstructionView> {
  const row = await prisma.$transaction(async (tx) => {
    const sortOrder = await nextSortOrder(
      tx,
      input.organizationId,
      input.agentKey,
    );
    const created = await tx.agentInstruction.create({
      data: {
        organizationId: input.organizationId,
        agentKey: input.agentKey,
        title: input.title?.trim() || null,
        content: input.content.trim(),
        enabled: input.enabled ?? true,
        sortOrder,
      },
    });
    await writeAudit(tx, {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "agent.instructions.created",
      title: "Agent instruction created",
      description: `Added instruction for ${input.agentKey}`,
      entityId: created.id,
      metadata: { agentKey: input.agentKey, instructionId: created.id },
    });
    return created;
  });
  return toView(row);
}

export async function updateInstruction(input: {
  organizationId: string;
  userId: string;
  agentKey: AgentKey;
  id: string;
  title?: string | null;
  content?: string;
  enabled?: boolean;
  sortOrder?: number;
}): Promise<AgentInstructionView | null> {
  const existing = await prisma.agentInstruction.findFirst({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      agentKey: input.agentKey,
    },
  });
  if (!existing) return null;

  const data: Prisma.AgentInstructionUpdateInput = {};
  if (input.title !== undefined) data.title = input.title?.trim() || null;
  if (input.content !== undefined) data.content = input.content.trim();
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.agentInstruction.update({
      where: { id: existing.id },
      data,
    });
    await writeAudit(tx, {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "agent.instructions.updated",
      title: "Agent instruction updated",
      description: `Updated instruction for ${input.agentKey}`,
      entityId: updated.id,
      metadata: { agentKey: input.agentKey, instructionId: updated.id },
    });
    return updated;
  });
  return toView(row);
}

export async function deleteInstruction(input: {
  organizationId: string;
  userId: string;
  agentKey: AgentKey;
  id: string;
}): Promise<boolean> {
  const existing = await prisma.agentInstruction.findFirst({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      agentKey: input.agentKey,
    },
  });
  if (!existing) return false;

  await prisma.$transaction(async (tx) => {
    await tx.agentInstruction.delete({ where: { id: existing.id } });
    await writeAudit(tx, {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "agent.instructions.deleted",
      title: "Agent instruction deleted",
      description: `Removed instruction for ${input.agentKey}`,
      entityId: existing.id,
      metadata: { agentKey: input.agentKey, instructionId: existing.id },
    });
  });
  return true;
}

export async function reorderInstructions(input: {
  organizationId: string;
  userId: string;
  agentKey: AgentKey;
  orderedIds: string[];
}): Promise<AgentInstructionView[]> {
  const existing = await prisma.agentInstruction.findMany({
    where: { organizationId: input.organizationId, agentKey: input.agentKey },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((r) => r.id));
  if (
    input.orderedIds.length !== existingIds.size ||
    input.orderedIds.some((id) => !existingIds.has(id))
  ) {
    throw new Error("orderedIds must list every instruction for this agent exactly once");
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < input.orderedIds.length; i += 1) {
      await tx.agentInstruction.update({
        where: { id: input.orderedIds[i] },
        data: { sortOrder: i },
      });
    }
    await writeAudit(tx, {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "agent.instructions.reordered",
      title: "Agent instructions reordered",
      description: `Reordered instructions for ${input.agentKey}`,
      metadata: { agentKey: input.agentKey, orderedIds: input.orderedIds },
    });
  });

  return listInstructions(input.organizationId, input.agentKey);
}

/**
 * Resolve the full system prompt for an agent run:
 * hardcoded base runbook + enabled org instruction lines.
 */
export async function resolveAgentSystemPrompt(
  organizationId: string,
  agentKey: AgentKey,
): Promise<string> {
  const base = getBaseAgentInstructions(agentKey);
  const rows = await prisma.agentInstruction.findMany({
    where: { organizationId, agentKey, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { content: true },
  });
  return mergeAgentInstructions(
    base,
    rows.map((r) => r.content),
  );
}

/** Map domain refresh keys → catalog AgentKey */
export function agentKeyForDomain(
  domain: "qa" | "devops" | "productivity" | "governance",
): AgentKey {
  return domain;
}
