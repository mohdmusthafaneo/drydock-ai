import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateMvpAccelerator } from "@/lib/mvp-accelerator";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.acceleratorProject.findFirst({
    where: { id, organizationId: session.organizationId },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [org, profile, dna] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.organizationId } }),
    prisma.organizationProfile.findUnique({
      where: { organizationId: session.organizationId },
    }),
    prisma.deliveryDNA.findUnique({
      where: { organizationId: session.organizationId },
    }),
  ]);

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const generated = generateMvpAccelerator({
    org,
    profile,
    dna,
    input: {
      title: project.title,
      idea: project.idea,
      targetUser: project.targetUser ?? undefined,
      problemStatement: project.problemStatement ?? undefined,
    },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.acceleratorProject.update({
      where: { id: project.id },
      data: {
        prdMarkdown: generated.prdMarkdown,
        architectureMarkdown: generated.architectureMarkdown,
        featuresJson: JSON.stringify(generated.features),
        jiraEpicsJson: JSON.stringify(generated.jiraEpics),
        qaPlanMarkdown: generated.qaPlanMarkdown,
        deploymentPlanMarkdown: generated.deploymentPlanMarkdown,
        roadmapJson: JSON.stringify(generated.roadmap),
        currentStep: "COMPLETE",
        status: "PENDING_APPROVAL",
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: session.organizationId,
        type: "accelerator.generated",
        title: `MVP package generated: ${project.title}`,
        description: "PRD, architecture, features, Jira epics, QA and deployment plans ready for review",
        metadataJson: JSON.stringify({ projectId: project.id }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "accelerator.generated",
        entityType: "AcceleratorProject",
        entityId: project.id,
      },
    });

    return p;
  });

  return NextResponse.json({ ok: true, project: updated });
}
