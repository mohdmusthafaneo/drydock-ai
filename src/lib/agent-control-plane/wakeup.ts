import { prisma } from "@/lib/prisma";
import type { AgentWakeupSource } from "@/generated/prisma/client";
import { logAgentActivity, logAgentAudit } from "./audit";
import { resolveRuntimeConfig } from "./runtime-config";
import { triggerWakeupProcessing } from "./worker-poke";
import { sendAgentWakeupJob } from "@/lib/jobs/agent-wakeup-job";
import { isPgBossEnabled } from "@/lib/jobs/boss";
import {
  NON_RUNNABLE_STATUSES,
  WAKEUP_SOURCE_PRIORITY,
  type EnqueueWakeupInput,
} from "./types";

export function isAgentRunnable(status: string): boolean {
  return !NON_RUNNABLE_STATUSES.has(status);
}

async function shouldCoalesceWithActiveWakeup(input: {
  organizationId: string;
  agentId: string;
  coalescingEnabled: boolean;
}): Promise<{ id: string } | null> {
  if (!input.coalescingEnabled) return null;

  return prisma.agentWakeupRequest.findFirst({
    where: {
      organizationId: input.organizationId,
      agentId: input.agentId,
      status: { in: ["queued", "running"] },
    },
    orderBy: { requestedAt: "asc" },
    select: { id: true },
  });
}

/**
 * Enqueue a wakeup for an agent. Coalesces duplicate queued/running wakeups
 * for the same agent when coalescingEnabled. Respects idempotency keys.
 */
export async function enqueueWakeup(input: EnqueueWakeupInput) {
  const { organizationId, agentId, source, reason, payload, idempotencyKey } =
    input;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id: agentId, organizationId },
  });

  if (!agent) {
    return { ok: false as const, error: "Agent not found" };
  }

  if (!isAgentRunnable(agent.status)) {
    return { ok: false as const, error: `Agent is ${agent.status}` };
  }

  const runtimeConfig = resolveRuntimeConfig(agent);
  const { coalescingEnabled } = runtimeConfig.heartbeat;

  if (idempotencyKey) {
    const existing = await prisma.agentWakeupRequest.findFirst({
      where: { organizationId, idempotencyKey },
    });
    if (existing) {
      return { ok: true as const, wakeupId: existing.id, coalesced: true };
    }
  }

  const coalesceTarget = await shouldCoalesceWithActiveWakeup({
    organizationId,
    agentId,
    coalescingEnabled,
  });

  if (coalesceTarget) {
    await prisma.agentWakeupRequest.update({
      where: { id: coalesceTarget.id },
      data: { coalescedCount: { increment: 1 } },
    });
    return { ok: true as const, wakeupId: coalesceTarget.id, coalesced: true };
  }

  const wakeup = await prisma.$transaction(async (tx) => {
    const created = await tx.agentWakeupRequest.create({
      data: {
        organizationId,
        agentId,
        source,
        reason,
        status: "queued",
        payloadJson: JSON.stringify(payload ?? {}),
        idempotencyKey,
      },
    });

    await logAgentActivity(tx, {
      organizationId,
      type: "agent.wakeup.enqueued",
      title: `Wakeup queued for ${agent.displayName}`,
      description: reason,
      metadata: { agentId, source, wakeupId: created.id },
    });

    await logAgentAudit(tx, {
      organizationId,
      action: "agent.wakeup.enqueued",
      entityType: "AgentWakeupRequest",
      entityId: created.id,
      agentId,
      metadata: { source, reason },
    });

    return created;
  });

  if (isPgBossEnabled()) {
    void sendAgentWakeupJob({
      wakeupId: wakeup.id,
      organizationId,
      source,
    });
  } else if (source !== "timer") {
    void triggerWakeupProcessing({
      organizationId,
      wakeupId: wakeup.id,
      immediate: source === "delegation",
    });
  }

  return { ok: true as const, wakeupId: wakeup.id, coalesced: false };
}

/** Wake agents configured with wakeOnApproval after an approval decision. */
export async function enqueueApprovalFollowUpWakeups(
  organizationId: string,
  approvalId: string,
  decision: string,
) {
  const agents = await prisma.agentRegistry.findMany({
    where: { organizationId },
  });

  const idempotencyKey = `approval:${approvalId}:${decision.toLowerCase()}`;

  for (const agent of agents) {
    const config = resolveRuntimeConfig(agent);
    if (!config.heartbeat.wakeOnApproval) continue;
    if (!isAgentRunnable(agent.status)) continue;

    await enqueueWakeup({
      organizationId,
      agentId: agent.id,
      source: "approval",
      reason: `approval.${decision.toLowerCase()}`,
      payload: { approvalId, decision },
      idempotencyKey: `${idempotencyKey}:${agent.id}`,
    });
  }
}

export function compareWakeupPriority(
  a: { source: AgentWakeupSource; requestedAt: Date },
  b: { source: AgentWakeupSource; requestedAt: Date },
): number {
  const priorityDiff =
    WAKEUP_SOURCE_PRIORITY[a.source] - WAKEUP_SOURCE_PRIORITY[b.source];
  if (priorityDiff !== 0) return priorityDiff;
  return a.requestedAt.getTime() - b.requestedAt.getTime();
}
