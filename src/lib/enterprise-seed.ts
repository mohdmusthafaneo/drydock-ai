import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_AGENT_DEFINITIONS } from "@/lib/agents";
import {
  defaultRuntimeConfigForAgentType,
  serializeRuntimeConfig,
} from "@/lib/agent-control-plane/runtime-config";
import { ensureAgentApiKey } from "@/lib/agent-control-plane/api-keys";
import {
  buildInstructionsAdapterConfig,
  ensureSuperAgentInstructions,
} from "@/lib/agent-control-plane/instructions/service";

const SUPER_AGENT = DEFAULT_AGENT_DEFINITIONS[0];

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

  const runtimeConfig = defaultRuntimeConfigForAgentType(SUPER_AGENT.agentType);
  const permissionsJson = JSON.stringify({ canCreateAgents: true });

  const superAgent = await tx.agentRegistry.findFirst({
    where: {
      organizationId,
      agentType: SUPER_AGENT.agentType,
    },
  });

  const agentData = {
    displayName: SUPER_AGENT.displayName,
    description: SUPER_AGENT.description,
    confidenceScore: SUPER_AGENT.defaultConfidence,
    autonomyMode: SUPER_AGENT.autonomyMode,
    status: "IDLE" as const,
    runtimeConfigJson: serializeRuntimeConfig(runtimeConfig),
    permissionsJson,
    adapterType: "llm",
  };

  const superAgentRecord = superAgent
    ? await tx.agentRegistry.update({
        where: { id: superAgent.id },
        data: agentData,
      })
    : await tx.agentRegistry.create({
        data: {
          organizationId,
          agentType: SUPER_AGENT.agentType,
          ...agentData,
          adapterConfigJson: "{}",
          lastActiveAt: new Date(),
        },
      });

  const { adapterConfig } = await ensureSuperAgentInstructions(
    organizationId,
    superAgentRecord.id,
  );

  await tx.agentRegistry.update({
    where: { id: superAgentRecord.id },
    data: {
      adapterConfigJson: JSON.stringify(adapterConfig),
    },
  });

  await ensureAgentApiKey(tx, organizationId, superAgentRecord.id, "bootstrap");

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
