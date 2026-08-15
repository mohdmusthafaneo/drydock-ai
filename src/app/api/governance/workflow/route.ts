import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { determineActorType } from "@/lib/audit-helpers";

const schema = z.object({
  executionStatus: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
  autonomyMode: z
    .enum(["OBSERVE", "RECOMMEND", "ASSIST", "SEMI_AUTONOMOUS", "AUTONOMOUS"])
    .optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());

    const dna = await prisma.deliveryDNA.findUnique({
      where: { organizationId: session.organizationId },
    });
    if (!dna) {
      return NextResponse.json({ error: "Complete governance setup first" }, { status: 400 });
    }

    if (body.autonomyMode) {
      await prisma.deliveryDNA.update({
        where: { organizationId: session.organizationId },
        data: { autonomyMode: body.autonomyMode },
      });
    }

    const workflow = await prisma.deliveryWorkflow.upsert({
      where: { organizationId: session.organizationId },
      create: {
        organizationId: session.organizationId,
        workflowType: dna.workflowMode,
        executionStatus: body.executionStatus ?? "ACTIVE",
        configuredAt: new Date(),
        stepsCompletedJson: JSON.stringify(["auth", "discovery", "workflow-config"]),
        currentStepId: "qa-init",
      },
      update: {
        executionStatus: body.executionStatus ?? undefined,
        configuredAt: new Date(),
        stepsCompletedJson: JSON.stringify([
          "auth",
          "discovery",
          "integrations",
          "workflow-config",
        ]),
        currentStepId: "qa-init",
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "workflow.configured",
        entityType: "DeliveryWorkflow",
        entityId: workflow.id,
        metadataJson: JSON.stringify(body),
        actorType: determineActorType(session.userId, "workflow.configured"),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
