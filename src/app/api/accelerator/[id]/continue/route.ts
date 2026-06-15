import { NextResponse } from "next/server";
import { z } from "zod";

import {
  findAcceleratorWorkflowRun,
  mapSuspendedStepToAcceleratorStep,
  storeAcceleratorWorkflowRun,
} from "@/lib/accelerator/workflow-state";
import { resolveSuspendedStepKey, readStepOutput } from "@/lib/accelerator/workflow-run-result";
import { isMvpAcceleratorLlmEnabled } from "@/lib/mastra-feature-flags";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getMastra } from "@/mastra";
import {
  stepApprovalSuspendSchema,
  waitArchitectureApprovalStep,
  waitPrdApprovalStep,
} from "@/mastra/workflows/mvp-accelerator";

const continueSchema = z.object({
  approved: z.boolean(),
  runId: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMvpAcceleratorLlmEnabled()) {
    return NextResponse.json(
      { error: "MVP accelerator LLM workflow is not enabled" },
      { status: 400 },
    );
  }

  const { id } = await params;

  let body: z.infer<typeof continueSchema>;
  try {
    body = continueSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid continue payload" }, { status: 400 });
  }

  const project = await prisma.acceleratorProject.findFirst({
    where: { id, organizationId: session.organizationId },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.status !== "IN_PROGRESS") {
    return NextResponse.json(
      { error: "Project is not awaiting step approval" },
      { status: 400 },
    );
  }

  const runId =
    body.runId ??
    (await findAcceleratorWorkflowRun(session.organizationId, project.id));

  if (!runId) {
    return NextResponse.json(
      { error: "No in-progress Mastra workflow run found for this project" },
      { status: 400 },
    );
  }

  const mastra = await getMastra();
  const workflow = mastra.getWorkflow("mvpAcceleratorWorkflow");
  const run = await workflow.createRun({ runId });

  const resumeStep =
    project.currentStep === "ARCHITECTURE"
      ? waitArchitectureApprovalStep
      : waitPrdApprovalStep;

  const result = await run.resume({
    step: resumeStep,
    resumeData: { approved: body.approved },
  });

  if (!body.approved) {
    const updated = await prisma.acceleratorProject.update({
      where: { id: project.id },
      data: { status: "DRAFT" },
    });
    return NextResponse.json({
      ok: true,
      workflowStatus: "rejected",
      project: updated,
    });
  }

  if (result.status === "suspended") {
    const suspendedStepId = resolveSuspendedStepKey(result.suspended);
    const stepResult = suspendedStepId
      ? result.steps?.[suspendedStepId]
      : undefined;
    const suspendPayload = stepApprovalSuspendSchema.safeParse(
      stepResult?.suspendPayload,
    );

    const stepOutput = readStepOutput<{
      prdMarkdown?: string;
      architectureMarkdown?: string;
    }>(stepResult);

    const prdMarkdown = stepOutput?.prdMarkdown ?? project.prdMarkdown;
    const architectureMarkdown =
      stepOutput?.architectureMarkdown ?? project.architectureMarkdown;

    const pendingStep = suspendPayload.success
      ? mapSuspendedStepToAcceleratorStep(suspendPayload.data.step)
      : "ARCHITECTURE";

    await storeAcceleratorWorkflowRun({
      organizationId: session.organizationId,
      projectId: project.id,
      runId,
      suspendedStep: pendingStep,
    });

    const updated = await prisma.acceleratorProject.update({
      where: { id: project.id },
      data: {
        ...(prdMarkdown ? { prdMarkdown } : {}),
        ...(architectureMarkdown ? { architectureMarkdown } : {}),
        currentStep: pendingStep,
        status: "IN_PROGRESS",
      },
    });

    return NextResponse.json({
      ok: true,
      workflowStatus: "suspended",
      runId,
      pendingStep,
      suspendMessage: suspendPayload.success
        ? suspendPayload.data.message
        : "Human approval required before continuing",
      project: updated,
    });
  }

  if (result.status !== "success" || !result.result) {
    return NextResponse.json(
      { error: `Workflow resume failed: ${result.status}` },
      { status: 500 },
    );
  }

  const generated = result.result;
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.acceleratorProject.update({
      where: { id: project.id },
      data: {
        prdMarkdown: generated.prdMarkdown,
        architectureMarkdown: generated.architectureMarkdown,
        featuresJson: generated.featuresJson,
        jiraEpicsJson: generated.jiraEpicsJson,
        qaPlanMarkdown: generated.qaPlanMarkdown,
        deploymentPlanMarkdown: generated.deploymentPlanMarkdown,
        roadmapJson: generated.roadmapJson,
        currentStep: "COMPLETE",
        status: "PENDING_APPROVAL",
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: session.organizationId,
        type: "accelerator.generated",
        title: `MVP package generated: ${project.title}`,
        description: "LLM workflow completed — ready for final approval",
        metadataJson: JSON.stringify({ projectId: project.id, runId }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "accelerator.workflow.completed",
        entityType: "AcceleratorProject",
        entityId: project.id,
        metadataJson: JSON.stringify({ runId }),
      },
    });

    return p;
  });

  return NextResponse.json({
    ok: true,
    workflowStatus: "success",
    runId,
    project: updated,
  });
}
