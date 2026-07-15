import type { Prisma } from "@/generated/prisma/client";

export async function seedEnterpriseFoundation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  workflowType: string,
  _autonomyMode: "OBSERVE" | "RECOMMEND" | "ASSIST" | "SEMI_AUTONOMOUS" | "AUTONOMOUS",
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
