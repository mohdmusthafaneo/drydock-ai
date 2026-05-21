import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

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

  if (!project.prdMarkdown) {
    return NextResponse.json(
      { error: "Generate the MVP package before approval" },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.acceleratorProject.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: session.organizationId,
        type: "accelerator.approved",
        title: `MVP package approved: ${project.title}`,
        description: "Human approval recorded — ready for engineering execution",
        metadataJson: JSON.stringify({ projectId: project.id }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "accelerator.approved",
        entityType: "AcceleratorProject",
        entityId: project.id,
      },
    });

    return p;
  });

  return NextResponse.json({ ok: true, project: updated });
}
