import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PrometheusApiError, formatPrometheusConnectError } from "@/lib/prometheus-api";
import { syncPrometheusIntegration } from "@/lib/prometheus-sync";
import { requirePermission } from "@/lib/rbac";
import { getSession } from "@/lib/session";

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
    const result = await syncPrometheusIntegration({
      organizationId: session.organizationId,
      userId: session.userId,
    });
    return NextResponse.json({
      ok: true,
      summary: result.summary,
      syncedAt: result.syncedAt,
      healthScore: result.healthScore,
    });
  } catch (e) {
    const message = formatPrometheusConnectError(e);

    await prisma.integration
      .update({
        where: {
          organizationId_provider: {
            organizationId: session.organizationId,
            provider: "PROMETHEUS",
          },
        },
        data: { lastError: message },
      })
      .catch(() => undefined);

    if (e instanceof PrometheusApiError) {
      return NextResponse.json({ error: message }, { status: e.status === 401 ? 401 : 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
