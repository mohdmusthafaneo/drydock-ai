import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { checkIntegrationHealth } from "@/lib/integration-health";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "integrations", "view");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const integrations = await prisma.integration.findMany({
    where: { organizationId: session.organizationId },
  });

  const health = await Promise.all(integrations.map((i) => checkIntegrationHealth(i)));

  return NextResponse.json({
    integrations: health,
    summary: {
      total: health.length,
      healthy: health.filter((h) => h.healthy).length,
      unhealthy: health.filter((h) => !h.healthy).length,
    },
  });
}

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "integrations", "manage_integrations");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const integrations = await prisma.integration.findMany({
    where: {
      organizationId: session.organizationId,
      status: "CONNECTED",
    },
  });

  for (const i of integrations) {
    await prisma.integration.update({
      where: { id: i.id },
      data: { lastSyncAt: new Date(), lastError: null },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: session.organizationId,
      userId: session.userId,
      action: "integrations.sync_all",
      entityType: "Integration",
    },
  });

  const health = await Promise.all(
    integrations.map((i) => checkIntegrationHealth({ ...i, lastSyncAt: new Date() })),
  );

  return NextResponse.json({ ok: true, integrations: health });
}
