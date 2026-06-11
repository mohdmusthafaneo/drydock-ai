import type { AgentRegistry } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logAgentActivity, logAgentAudit } from "./audit";
import { resolveRuntimeConfig } from "./runtime-config";
import { enqueueWakeup, isAgentRunnable } from "./wakeup";
import type { HireRole } from "./hire";

export type DelegationTargetRole = HireRole;

/** Maps operational events to specialist roles the Super Agent should delegate to. */
export const EVENT_ROLE_ROUTING: Record<string, DelegationTargetRole> = {
  "release.detected": "qa_intelligence",
  "release.assessed": "governance",
  "webhook.received": "integration",
  "telemetry.ingested": "devops_intelligence",
  "incident.opened": "incident_correlation",
};

export async function findSuperAgent(
  organizationId: string,
): Promise<AgentRegistry | null> {
  return prisma.agentRegistry.findFirst({
    where: { organizationId, agentType: "SUPER_ORCHESTRATOR" },
  });
}

export async function findSpecialistsByRole(
  organizationId: string,
  role: DelegationTargetRole,
): Promise<AgentRegistry[]> {
  return prisma.agentRegistry.findMany({
    where: {
      organizationId,
      role,
      status: { notIn: ["PAUSED", "PENDING_APPROVAL", "TERMINATED", "ERROR"] },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function enqueueSuperAgentEventWakeup(
  organizationId: string,
  reason: string,
  payload: Record<string, unknown> = {},
  idempotencyKey?: string,
) {
  const superAgent = await findSuperAgent(organizationId);
  if (!superAgent || !isAgentRunnable(superAgent.status)) return { ok: false as const };

  const config = resolveRuntimeConfig(superAgent);
  if (!config.heartbeat.wakeOnEvent) return { ok: false as const };

  return enqueueWakeup({
    organizationId,
    agentId: superAgent.id,
    source: "event",
    reason,
    payload,
    idempotencyKey:
      idempotencyKey ??
      `event:${reason}:${String(payload.releaseId ?? payload.webhookEventId ?? payload.telemetryEventId ?? Date.now())}`,
  });
}

export type DelegateWakeupInput = {
  organizationId: string;
  delegatingAgentId: string;
  targetAgentId: string;
  reason: string;
  payload?: Record<string, unknown>;
  runId?: string;
};

/**
 * Enqueue a delegation wakeup from Super Agent (or lead) to a specialist.
 * Validates org scope, reporting chain, and wakeOnDelegation on target.
 */
export async function delegateWakeup(input: DelegateWakeupInput) {
  const { organizationId, delegatingAgentId, targetAgentId, reason, payload, runId } =
    input;

  const [delegator, target] = await Promise.all([
    prisma.agentRegistry.findFirst({
      where: { id: delegatingAgentId, organizationId },
    }),
    prisma.agentRegistry.findFirst({
      where: { id: targetAgentId, organizationId },
    }),
  ]);

  if (!delegator) {
    return { ok: false as const, error: "Delegating agent not found" };
  }
  if (!target) {
    return { ok: false as const, error: "Target agent not found" };
  }

  if (delegator.agentType !== "SUPER_ORCHESTRATOR") {
    return { ok: false as const, error: "Only Super Agent may delegate wakeups" };
  }

  if (target.agentType === "SUPER_ORCHESTRATOR") {
    return { ok: false as const, error: "Cannot delegate to Super Agent" };
  }

  if (target.reportsToAgentId && target.reportsToAgentId !== delegator.id) {
    return { ok: false as const, error: "Target agent does not report to delegator" };
  }

  if (!isAgentRunnable(target.status)) {
    return { ok: false as const, error: `Target agent is ${target.status}` };
  }

  const targetConfig = resolveRuntimeConfig(target);
  if (!targetConfig.heartbeat.wakeOnDelegation) {
    return { ok: false as const, error: "Target agent has wakeOnDelegation disabled" };
  }

  const chatThreadId =
    typeof payload?.threadId === "string" ? payload.threadId : undefined;
  const chatTriggerId =
    typeof payload?.triggerMessageId === "string"
      ? payload.triggerMessageId
      : undefined;

  const idempotencyKey =
    chatThreadId && chatTriggerId
      ? `chat:${chatThreadId}:${chatTriggerId}:${target.id}`
      : `delegation:${delegator.id}:${target.id}:${reason}:${JSON.stringify(payload ?? {})}`;

  const wakeupResult = await enqueueWakeup({
    organizationId,
    agentId: target.id,
    source: "delegation",
    reason,
    payload: {
      ...payload,
      delegatedByAgentId: delegator.id,
      delegatedByRunId: runId,
    },
    idempotencyKey,
  });

  if (!wakeupResult.ok) {
    return { ok: false as const, error: wakeupResult.error };
  }

  await prisma.$transaction(async (tx) => {
    await logAgentActivity(tx, {
      organizationId,
      type: "agent.delegation.enqueued",
      title: `${delegator.displayName} delegated to ${target.displayName}`,
      description: reason,
      metadata: {
        delegatorId: delegator.id,
        targetId: target.id,
        wakeupId: wakeupResult.wakeupId,
        reason,
      },
    });

    await logAgentAudit(tx, {
      organizationId,
      action: "agent.delegation.enqueued",
      entityType: "AgentWakeupRequest",
      entityId: wakeupResult.wakeupId,
      agentId: delegator.id,
      metadata: { targetAgentId: target.id, reason, runId },
    });
  });

  return {
    ok: true as const,
    wakeupId: wakeupResult.wakeupId,
    coalesced: wakeupResult.coalesced,
    targetAgent: { id: target.id, displayName: target.displayName, role: target.role },
  };
}

/** Resolve a specialist by role and enqueue delegation (used by Super Agent tool). */
export async function delegateToRole(
  organizationId: string,
  delegatingAgentId: string,
  role: DelegationTargetRole,
  reason: string,
  payload: Record<string, unknown> = {},
  runId?: string,
) {
  const specialists = await findSpecialistsByRole(organizationId, role);
  const target = specialists[0];
  if (!target) {
    return {
      ok: false as const,
      error: `No runnable specialist found for role: ${role}`,
    };
  }

  return delegateWakeup({
    organizationId,
    delegatingAgentId,
    targetAgentId: target.id,
    reason,
    payload: { ...payload, targetRole: role },
    runId,
  });
}
