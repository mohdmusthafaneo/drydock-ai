import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { GrafanaApiError, formatGrafanaSyncError } from "@/lib/grafana-api";
import { fetchOrgGrafanaPrometheusDatasources } from "@/lib/grafana-metrics-config";

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
    const result = await fetchOrgGrafanaPrometheusDatasources(session.organizationId);
    return NextResponse.json({
      ok: true,
      datasources: result.datasources,
      selected: result.selected,
    });
  } catch (e) {
    const message = formatGrafanaSyncError(e);
    if (e instanceof GrafanaApiError) {
      const status =
        e.status === 401 ? 401 : e.status === 403 ? 403 : e.status === 400 ? 400 : 502;
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
