import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const createSchema = z.object({
  title: z.string().min(3),
  idea: z.string().min(20),
  targetUser: z.string().optional(),
  problemStatement: z.string().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.acceleratorProject.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await request.json());

    const project = await prisma.acceleratorProject.create({
      data: {
        organizationId: session.organizationId,
        title: body.title.trim(),
        idea: body.idea.trim(),
        targetUser: body.targetUser?.trim(),
        problemStatement: body.problemStatement?.trim(),
        createdById: session.userId,
        status: "DRAFT",
        currentStep: "IDEA",
      },
    });

    await prisma.activityEvent.create({
      data: {
        organizationId: session.organizationId,
        type: "accelerator.created",
        title: `MVP project started: ${project.title}`,
        description: "Idea captured in MVP Accelerator",
        metadataJson: JSON.stringify({ projectId: project.id }),
      },
    });

    return NextResponse.json({ ok: true, project });
  } catch {
    return NextResponse.json({ error: "Invalid project data" }, { status: 400 });
  }
}
