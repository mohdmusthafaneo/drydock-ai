import { prisma } from "@/lib/prisma";
import { readJsonField } from "@/lib/json-field";

const WORKFLOW_RUN_EVENT = "accelerator.workflow.run";

export async function storeAcceleratorWorkflowRun(input: {
  organizationId: string;
  projectId: string;
  runId: string;
  suspendedStep?: string;
}): Promise<void> {
  await prisma.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: WORKFLOW_RUN_EVENT,
      title: "MVP accelerator Mastra workflow run",
      description: input.suspendedStep
        ? `Suspended at ${input.suspendedStep}`
        : "Workflow run started",
      metadataJson: JSON.stringify({
        projectId: input.projectId,
        runId: input.runId,
        suspendedStep: input.suspendedStep ?? null,
      }),
    },
  });
}

export async function findAcceleratorWorkflowRun(
  organizationId: string,
  projectId: string,
): Promise<string | null> {
  const events = await prisma.activityEvent.findMany({
    where: { organizationId, type: WORKFLOW_RUN_EVENT },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { metadataJson: true },
  });

  for (const event of events) {
    const meta = readJsonField<{ projectId?: string; runId?: string }>(event.metadataJson, {});
    if (meta.projectId === projectId && meta.runId) {
      return meta.runId;
    }
  }

  return null;
}

export function mapSuspendedStepToAcceleratorStep(
  step: "PRD" | "ARCHITECTURE",
): "PRD" | "ARCHITECTURE" {
  return step;
}
