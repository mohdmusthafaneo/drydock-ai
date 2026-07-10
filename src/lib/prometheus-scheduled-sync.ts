import { prisma } from "@/lib/prisma";
import { syncPrometheusIntegration } from "@/lib/prometheus-sync";
import { parsePrometheusMeta } from "@/lib/prometheus-meta";
import { PrometheusApiError } from "@/lib/prometheus-api";
import { resolveOrgActorUserId } from "@/lib/integration-scheduled-utils";

const SYNC_INTERVAL_MS = 15 * 60 * 1000;

export type ScheduledPrometheusSyncOrgResult = {
  organizationId: string;
  status: "synced" | "skipped" | "failed";
  reason?: string;
  summary?: string;
  syncedAt?: string;
  error?: string;
};

function formatPrometheusSyncError(err: unknown): string {
  if (err instanceof PrometheusApiError) {
    return `Prometheus API error (${err.status}): ${err.message}`;
  }
  return err instanceof Error ? err.message : "Sync failed";
}

/** Sync a single org's Prometheus integration (used by refresh.org and on-demand routes). */
export async function runPrometheusSyncForOrg(
  organizationId: string,
): Promise<ScheduledPrometheusSyncOrgResult> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "PROMETHEUS" },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    return { organizationId, status: "skipped", reason: "prometheus_not_connected" };
  }

  const meta = parsePrometheusMeta(integration.metadataJson);
  if (!meta.prometheusUrl) {
    return { organizationId, status: "skipped", reason: "missing_prometheus_url" };
  }

  if (!meta.serviceScopes?.length) {
    return {
      organizationId,
      status: "skipped",
      reason: "no_service_scopes_selected",
    };
  }

  const now = Date.now();
  if (
    integration.lastSyncAt &&
    now - integration.lastSyncAt.getTime() < SYNC_INTERVAL_MS
  ) {
    return { organizationId, status: "skipped", reason: "recently_synced" };
  }

  const userId = await resolveOrgActorUserId(organizationId);
  if (!userId) {
    return { organizationId, status: "skipped", reason: "no_active_user" };
  }

  try {
    const result = await syncPrometheusIntegration({ organizationId, userId });
    return {
      organizationId,
      status: "synced",
      summary: result.summary,
      syncedAt: result.syncedAt,
    };
  } catch (err) {
    const message = formatPrometheusSyncError(err);

    await prisma.integration
      .update({
        where: {
          organizationId_provider: { organizationId, provider: "PROMETHEUS" },
        },
        data: { lastError: message },
      })
      .catch(() => undefined);

    return {
      organizationId,
      status: "failed",
      error: message,
      ...(err instanceof PrometheusApiError
        ? { reason: `prometheus_api_${err.status}` }
        : {}),
    };
  }
}

export async function runScheduledPrometheusSync(input?: {
  organizationId?: string;
}): Promise<{
  attempted: number;
  synced: number;
  skipped: number;
  failed: number;
  results: ScheduledPrometheusSyncOrgResult[];
}> {
  const orgIds = input?.organizationId
    ? [input.organizationId]
    : (
        await prisma.integration.findMany({
          where: { provider: "PROMETHEUS", status: "CONNECTED" },
          select: { organizationId: true },
          orderBy: { organizationId: "asc" },
        })
      ).map((row) => row.organizationId);

  const results: ScheduledPrometheusSyncOrgResult[] = [];

  for (const organizationId of orgIds) {
    results.push(await runPrometheusSyncForOrg(organizationId));
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
