import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { syncGrafanaIntegration } from "@/lib/grafana-sync";
import { GrafanaApiError, formatGrafanaSyncError } from "@/lib/grafana-api";
import { prisma } from "@/lib/prisma";

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

  try {
    const result = await syncGrafanaIntegration({
      organizationId: session.organizationId,
      userId: session.userId,
    });
    return NextResponse.json({
      ok: true,
      summary: result.summary,
      syncedAt: result.syncedAt,
      dashboardCount: result.dashboardCount,
      openAlerts: result.openAlerts,
      healthScore: result.snapshot.kpis.healthScore,
    });
  } catch (e) {
    const message = formatGrafanaSyncError(e);

    await prisma.integration
      .update({
        where: {
          organizationId_provider: {
            organizationId: session.organizationId,
            provider: "GRAFANA",
          },
        },
        data: { lastError: message },
      })
      .catch(() => undefined);

    if (e instanceof GrafanaApiError) {
      return NextResponse.json({ error: message }, { status: e.status === 401 ? 401 : 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
