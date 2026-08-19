import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getLandingPathForOrganization } from "@/lib/landing-path-org";

const schema = z.object({
  workspaceMode: z.enum(["MVP", "ENTERPRISE"]),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceMode } = schema.parse(await request.json());

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: session.organizationId },
        data: { workspaceMode },
      });

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: "workspace.mode_changed",
          entityType: "Organization",
          entityId: session.organizationId,
          metadataJson: JSON.stringify({ workspaceMode }),
        },
      });
    });

    const redirect = await getLandingPathForOrganization(session.organizationId);

    return NextResponse.json({
      ok: true,
      redirect,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
