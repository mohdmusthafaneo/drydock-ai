import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_AGENT_DEFINITIONS } from "@/lib/agents";
import {
  defaultRuntimeConfigForAgentType,
  serializeRuntimeConfig,
} from "@/lib/agent-control-plane/runtime-config";
import { ensureAgentApiKey } from "@/lib/agent-control-plane/api-keys";

export async function seedEnterpriseFoundation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  workflowType: string,
  autonomyMode: "OBSERVE" | "RECOMMEND" | "ASSIST" | "SEMI_AUTONOMOUS" | "AUTONOMOUS",
) {
  await tx.deliveryWorkflow.upsert({
    where: { organizationId },
    create: {
      organizationId,
      workflowType,
      executionStatus: "NOT_CONFIGURED",
      currentStepId: "integrations",
      stepsCompletedJson: JSON.stringify(["auth", "discovery"]),
    },
    update: {
      workflowType,
      executionStatus: "ACTIVE",
    },
  });

  let leadAgentId: string | null = null;

  for (const agent of DEFAULT_AGENT_DEFINITIONS) {
    const runtimeConfig = defaultRuntimeConfigForAgentType(agent.agentType);
    const permissionsJson =
      agent.agentType === "SUPER_ORCHESTRATOR"
        ? JSON.stringify({ canCreateAgents: false })
        : JSON.stringify({ canCreateAgents: false });

    const upserted = await tx.agentRegistry.upsert({
      where: {
        organizationId_agentType: {
          organizationId,
          agentType: agent.agentType,
        },
      },
      create: {
        organizationId,
        agentType: agent.agentType,
        displayName: agent.displayName,
        description: agent.description,
        confidenceScore: agent.defaultConfidence,
        autonomyMode: agent.autonomyMode,
        status: "IDLE",
        runtimeConfigJson: serializeRuntimeConfig(runtimeConfig),
        permissionsJson,
        adapterType: "internal",
        lastActiveAt:
          agent.agentType === "SUPER_ORCHESTRATOR" ? new Date() : null,
      },
      update: {
        displayName: agent.displayName,
        description: agent.description,
        runtimeConfigJson: serializeRuntimeConfig(runtimeConfig),
        permissionsJson,
      },
    });

    if (agent.agentType === "SUPER_ORCHESTRATOR") {
      leadAgentId = upserted.id;
    }
  }

  if (leadAgentId) {
    await tx.agentRegistry.updateMany({
      where: {
        organizationId,
        agentType: { not: "SUPER_ORCHESTRATOR" },
      },
      data: { reportsToAgentId: leadAgentId },
    });

    await ensureAgentApiKey(tx, organizationId, leadAgentId, "bootstrap");
  }

  await tx.governancePolicy.upsert({
    where: { organizationId },
    create: {
      organizationId,
      deploymentThresholds: JSON.stringify({ minReadinessScore: 70, blockOnCritical: true }),
      releaseRulesJson: JSON.stringify({ requireApprovalForProduction: true }),
      approvalRequirements: JSON.stringify({ minApprovers: 1, qaLeadForHighRisk: true }),
      escalationChainsJson: JSON.stringify({ levels: ["DELIVERY_MANAGER", "ORG_ADMIN"] }),
    },
    update: {},
  });
}
