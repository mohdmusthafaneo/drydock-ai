import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { GrafanaApiError, formatGrafanaSyncError } from "@/lib/grafana-api";
import {
  checkGrafanaMetricsProbeRateLimit,
  runGrafanaMetricsProbe,
} from "@/lib/grafana-metrics-config";
import { parseGrafanaMeta } from "@/lib/grafana-meta";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  datasourceUid: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "integrations", "manage_integrations");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!checkGrafanaMetricsProbeRateLimit(session.organizationId)) {
    return NextResponse.json(
      { error: "Too many probe requests — try again in a minute" },
      { status: 429 },
    );
  }

  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    let datasourceUid = body.datasourceUid;
    if (!datasourceUid) {
      const integration = await prisma.integration.findUnique({
        where: {
          organizationId_provider: {
            organizationId: session.organizationId,
            provider: "GRAFANA",
          },
        },
      });
      const meta = integration ? parseGrafanaMeta(integration.metadataJson) : {};
      datasourceUid = meta.prometheusDatasource?.uid;
    }

    if (!datasourceUid) {
      return NextResponse.json({ error: "Select a Prometheus datasource first" }, { status: 400 });
    }

    const result = await runGrafanaMetricsProbe({
      organizationId: session.organizationId,
      datasourceUid,
    });

    return NextResponse.json({
      ok: true,
      summary: result.probe.summary,
      datasourceName: result.datasource.name,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const message = formatGrafanaSyncError(e);
    if (e instanceof GrafanaApiError) {
      const status =
        e.status === 401 ? 401 : e.status === 403 ? 403 : e.status === 400 ? 400 : 502;
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
