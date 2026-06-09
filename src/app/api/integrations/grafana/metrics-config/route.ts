import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { GrafanaApiError, formatGrafanaSyncError } from "@/lib/grafana-api";
import {
  MAX_GRAFANA_METRICS_SCOPES,
  saveOrgGrafanaMetricsConfig,
} from "@/lib/grafana-metrics-config";

const datasourceSchema = z.object({
  uid: z.string().min(1),
  name: z.string().min(1),
  type: z.literal("prometheus"),
});

const scopeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.literal("service"),
  environment: z.string().optional(),
});

const putSchema = z.object({
  prometheusDatasource: datasourceSchema,
  metricsServiceScopes: z.array(scopeSchema).max(MAX_GRAFANA_METRICS_SCOPES).optional(),
  promqlOverrides: z
    .record(z.string(), z.string().max(500))
    .optional(),
});

export async function PUT(request: Request) {
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
    const body = putSchema.parse(await request.json());
    const result = await saveOrgGrafanaMetricsConfig({
      organizationId: session.organizationId,
      userId: session.userId,
      prometheusDatasource: body.prometheusDatasource,
      metricsServiceScopes: body.metricsServiceScopes,
      promqlOverrides: body.promqlOverrides,
    });
    return NextResponse.json({ ok: true, probe: result.probe });
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
