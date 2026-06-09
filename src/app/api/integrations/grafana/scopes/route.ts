import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import {
  fetchOrgGrafanaScopes,
  MAX_GRAFANA_SCOPES,
  saveOrgGrafanaScopes,
} from "@/lib/grafana-scope-selection";
import { GrafanaApiError, formatGrafanaSyncError } from "@/lib/grafana-api";

const scopeSchema = z.object({
  uid: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["dashboard", "folder"]),
  folderTitle: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const putSchema = z.object({
  dashboardScopes: z.array(scopeSchema).min(1).max(MAX_GRAFANA_SCOPES),
  tagFilter: z.array(z.string()).optional(),
  alertLabelSelectors: z.record(z.string(), z.string()).optional(),
});

export async function GET() {
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
    const result = await fetchOrgGrafanaScopes(session.organizationId);
    return NextResponse.json({
      ok: true,
      items: result.items,
      selectedScopes: result.selectedScopes,
      tagFilter: result.tagFilter,
      alertLabelSelectors: result.alertLabelSelectors,
      maxScopes: MAX_GRAFANA_SCOPES,
    });
  } catch (e) {
    const message = formatGrafanaSyncError(e);
    if (e instanceof GrafanaApiError) {
      return NextResponse.json({ error: message }, { status: e.status === 401 ? 401 : 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

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
    const result = await saveOrgGrafanaScopes({
      organizationId: session.organizationId,
      userId: session.userId,
      dashboardScopes: body.dashboardScopes,
      tagFilter: body.tagFilter,
      alertLabelSelectors: body.alertLabelSelectors,
    });
    return NextResponse.json({ ok: true, dashboardScopes: result.dashboardScopes });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const message = formatGrafanaSyncError(e);
    if (e instanceof GrafanaApiError) {
      return NextResponse.json({ error: message }, { status: e.status === 401 ? 401 : 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
