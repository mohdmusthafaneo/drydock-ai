import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_AGENT_DEFINITIONS } from "@/lib/agents";

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

  for (const agent of DEFAULT_AGENT_DEFINITIONS) {
    await tx.agentRegistry.upsert({
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
        status: agent.agentType === "SUPER_ORCHESTRATOR" ? "ACTIVE" : "IDLE",
        lastActiveAt: agent.agentType === "SUPER_ORCHESTRATOR" ? new Date() : null,
      },
    update: {
      displayName: agent.displayName,
      description: agent.description,
    },
  });
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
