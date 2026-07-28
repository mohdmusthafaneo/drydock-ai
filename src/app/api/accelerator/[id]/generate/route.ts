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

  const acceleratorInput = {
    title: project.title,
    idea: project.idea,
    targetUser: project.targetUser ?? undefined,
    problemStatement: project.problemStatement ?? undefined,
  };

  const generated = generateMvpAccelerator({
    org,
    profile,
    dna,
    input: acceleratorInput,
  });

  const updated = await persistGeneratedProject({
    organizationId: session.organizationId,
    userId: session.userId,
    projectId: project.id,
    projectTitle: project.title,
    generated,
  });

  return NextResponse.json({ ok: true, project: updated });
}

async function persistGeneratedProject(input: {
  organizationId: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  generated: {
    prdMarkdown: string;
    architectureMarkdown: string;
    featuresJson?: string;
    jiraEpicsJson?: string;
    features?: unknown;
    jiraEpics?: unknown;
    qaPlanMarkdown: string;
    deploymentPlanMarkdown: string;
    roadmapJson?: string;
    roadmap?: unknown;
  };
}) {
  const featuresJson =
    input.generated.featuresJson ??
    JSON.stringify(input.generated.features ?? []);
  const jiraEpicsJson =
    input.generated.jiraEpicsJson ??
    JSON.stringify(input.generated.jiraEpics ?? []);
  const roadmapJson =
    input.generated.roadmapJson ??
    JSON.stringify(input.generated.roadmap ?? []);

  return prisma.$transaction(async (tx) => {
    const p = await tx.acceleratorProject.update({
      where: { id: input.projectId },
      data: {
        prdMarkdown: input.generated.prdMarkdown,
        architectureMarkdown: input.generated.architectureMarkdown,
        featuresJson,
        jiraEpicsJson,
        qaPlanMarkdown: input.generated.qaPlanMarkdown,
        deploymentPlanMarkdown: input.generated.deploymentPlanMarkdown,
        roadmapJson,
        currentStep: "COMPLETE",
        status: "PENDING_APPROVAL",
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "accelerator.generated",
        title: `MVP package generated: ${input.projectTitle}`,
        description:
          "PRD, architecture, features, Jira epics, QA and deployment plans ready for review",
        metadataJson: JSON.stringify({ projectId: input.projectId }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "accelerator.generated",
        entityType: "AcceleratorProject",
        entityId: input.projectId,
      },
    });

    return p;
  });
}
