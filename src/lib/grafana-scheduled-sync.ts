import { prisma } from "@/lib/prisma";
import { syncGrafanaIntegration } from "@/lib/grafana-sync";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
import { GrafanaApiError, formatGrafanaSyncError } from "@/lib/grafana-api";

const SYNC_INTERVAL_MS = 15 * 60 * 1000;

export type ScheduledGrafanaSyncOrgResult = {
  organizationId: string;
  status: "synced" | "skipped" | "failed";
  reason?: string;
  summary?: string;
  syncedAt?: string;
  dashboardCount?: number;
  openAlerts?: number;
  error?: string;
};

async function resolveOrgActorUserId(organizationId: string): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { organizationId, status: "ACTIVE", role: "ORG_ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (admin) return admin.id;

  const anyUser = await prisma.user.findFirst({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return anyUser?.id ?? null;
}

export async function runScheduledGrafanaSync(input?: {
  organizationId?: string;
}): Promise<{
  attempted: number;
  synced: number;
  skipped: number;
  failed: number;
  results: ScheduledGrafanaSyncOrgResult[];
}> {
  const integrations = await prisma.integration.findMany({
    where: {
      provider: "GRAFANA",
      status: "CONNECTED",
      ...(input?.organizationId ? { organizationId: input.organizationId } : {}),
    },
    orderBy: { organizationId: "asc" },
  });

  const results: ScheduledGrafanaSyncOrgResult[] = [];
  const now = Date.now();

  for (const integration of integrations) {
    const { organizationId } = integration;

    if (!isGrafanaTrulyConnected(integration)) {
      results.push({
        organizationId,
        status: "skipped",
        reason: "not_truly_connected",
      });
      continue;
    }

    const meta = parseGrafanaMeta(integration.metadataJson);
    if (!meta.dashboardScopes?.length) {
      results.push({
        organizationId,
        status: "skipped",
        reason: "no_dashboards_selected",
      });
      continue;
    }

    if (
      integration.lastSyncAt &&
      now - integration.lastSyncAt.getTime() < SYNC_INTERVAL_MS
    ) {
      results.push({
        organizationId,
        status: "skipped",
        reason: "recently_synced",
      });
      continue;
    }

    const userId = await resolveOrgActorUserId(organizationId);
    if (!userId) {
      results.push({
        organizationId,
        status: "skipped",
        reason: "no_active_user",
      });
      continue;
    }

    try {
      const result = await syncGrafanaIntegration({ organizationId, userId });
      results.push({
        organizationId,
        status: "synced",
        summary: result.summary,
        syncedAt: result.syncedAt,
        dashboardCount: result.dashboardCount,
        openAlerts: result.openAlerts,
      });
    } catch (e) {
      const message = formatGrafanaSyncError(e);

      await prisma.integration
        .update({
          where: {
            organizationId_provider: { organizationId, provider: "GRAFANA" },
          },
          data: { lastError: message },
        })
        .catch(() => undefined);

      results.push({
        organizationId,
        status: "failed",
        error: message,
        ...(e instanceof GrafanaApiError ? { reason: `grafana_api_${e.status}` } : {}),
      });
    }
  }

  if (input?.organizationId && integrations.length === 0) {
    results.push({
      organizationId: input.organizationId,
      status: "skipped",
      reason: "grafana_not_connected",
    });
  }

  const synced = results.filter((r) => r.status === "synced").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return {
    attempted: results.length,
    synced,
    skipped,
    failed,
    results,
  };
}
