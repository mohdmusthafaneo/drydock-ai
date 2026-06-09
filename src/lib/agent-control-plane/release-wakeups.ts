import { prisma } from "@/lib/prisma";
import { resolveRuntimeConfig } from "./runtime-config";
import { enqueueWakeup, isAgentRunnable } from "./wakeup";

const RELEASE_DETECTED_TYPES = ["QA_INTELLIGENCE", "GOVERNANCE"] as const;
const RELEASE_ASSESSED_TYPES = ["GOVERNANCE"] as const;

async function wakeAgentsForReleaseEvent(
  organizationId: string,
  releaseId: string,
  agentTypes: readonly string[],
  reason: string,
  idempotencySuffix: string,
) {
  const agents = await prisma.agentRegistry.findMany({
    where: {
      organizationId,
      agentType: { in: agentTypes as never[] },
    },
  });

  for (const agent of agents) {
    const config = resolveRuntimeConfig(agent);
    if (!config.heartbeat.wakeOnEvent) continue;
    if (!isAgentRunnable(agent.status)) continue;

    await enqueueWakeup({
      organizationId,
      agentId: agent.id,
      source: "event",
      reason,
      payload: { releaseId },
      idempotencyKey: `release:${releaseId}:${idempotencySuffix}:${agent.id}`,
    });
  }
}

/** Wake QA + Governance when a release is detected. */
export async function enqueueReleaseDetectedWakeups(
  organizationId: string,
  releaseId: string,
) {
  await wakeAgentsForReleaseEvent(
    organizationId,
    releaseId,
    RELEASE_DETECTED_TYPES,
    "release.detected",
    "detected",
  );
}

/** Wake Governance after human or agent assessment completes. */
export async function enqueueReleaseAssessedWakeups(
  organizationId: string,
  releaseId: string,
) {
  await wakeAgentsForReleaseEvent(
    organizationId,
    releaseId,
    RELEASE_ASSESSED_TYPES,
    "release.assessed",
    "assessed",
  );
}
