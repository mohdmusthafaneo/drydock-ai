import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";

const DEVOPS_ROLES = new Set(["ORG_ADMIN", "DEVOPS_LEAD", "ENGINEERING_MANAGER", "DELIVERY_MANAGER"]);

const schema = z.object({
  status: z.enum(["OPEN", "INVESTIGATING", "REMEDIATED", "CLOSED"]).optional(),
  remediationNotes: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!DEVOPS_ROLES.has(session.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = schema.parse(await request.json());

    const incident = await prisma.incident.findFirst({
      where: { id, organizationId: session.organizationId },
    });

    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const resolved =
      body.status === "REMEDIATED" || body.status === "CLOSED" ? new Date() : null;

    const updated = await prisma.incident.update({
      where: { id },
      data: {
        status: body.status,
        remediationNotes: body.remediationNotes ?? incident.remediationNotes,
        resolvedAt: resolved ?? incident.resolvedAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "incident.updated",
        entityType: "Incident",
        entityId: id,
        metadataJson: JSON.stringify(body),
      },
    });

    invalidateExecutiveBriefingSnapshot(session.organizationId);

    return NextResponse.json({ ok: true, incident: updated });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
