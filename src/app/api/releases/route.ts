import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  version: z.string().max(40).optional(),
  environment: z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION"]),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releases = await prisma.release.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ releases });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await request.json());

    const release = await prisma.release.create({
      data: {
        organizationId: session.organizationId,
        name: body.name.trim(),
        version: body.version?.trim() || null,
        environment: body.environment,
        status: "DETECTED",
      },
    });

    await prisma.activityEvent.create({
      data: {
        organizationId: session.organizationId,
        type: "release.detected",
        title: `Release detected: ${release.name}`,
        description: `${body.environment} environment`,
        metadataJson: JSON.stringify({ releaseId: release.id }),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "release.detected",
        entityType: "Release",
        entityId: release.id,
        metadataJson: JSON.stringify({ environment: body.environment }),
      },
    });

    return NextResponse.json({ ok: true, release });
  } catch {
    return NextResponse.json({ error: "Invalid release data" }, { status: 400 });
  }
}
