import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { prisma } from "@/lib/prisma";
import {
  countDashboardPanels,
  dashboardHasMissingDatasource,
  getGrafanaAuth,
  getGrafanaDashboard,
  getGrafanaDatasourceByUid,
  listGrafanaAlerts,
  listGrafanaAnnotations,
  type GrafanaAlertmanagerAlert,
} from "@/lib/grafana-api";
import { createGrafanaPrometheusProxyTransport } from "@/lib/grafana-prometheus-proxy";
import { buildGrafanaSnapshot } from "@/lib/grafana/health-score";
import { markIntegrationSync } from "@/lib/integration-health";
import {
  expandGrafanaScopesToDashboardUids,
  resolveSyncDashboardScopes,
} from "@/lib/grafana-scope-selection";
import {
  mergeGrafanaMeta,
  parseGrafanaMeta,
  type GrafanaDashboardScope,
  type GrafanaOperationalSnapshot,
} from "@/lib/grafana-meta";
import { ingestNormalizedEvents } from "@/lib/telemetry-ingest";
import {
  formatMetricsSyncSummary,
  runPromqlSync,
} from "@/lib/observability-metrics/run-promql-sync";
import type { MetricsProvenance } from "@/lib/observability-metrics/types";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import { determineActorType } from "@/lib/audit-helpers";
import type { MetricSource } from "@/generated/prisma/client";

const GRAFANA_SOURCE: MetricSource = "GRAFANA";

function matchesLabelSelectors(
  labels: Record<string, string>,
  selectors: Record<string, string>,
): boolean {
  if (!Object.keys(selectors).length) return true;
  return Object.entries(selectors).every(([key, value]) => labels[key] === value);
}

function normalizeAlertState(alert: GrafanaAlertmanagerAlert): "firing" | "resolved" {
  const state = alert.status?.state?.toLowerCase();
  if (state === "suppressed" || state === "resolved" || alert.endsAt) {
    return "resolved";
  }
  return "firing";
}

function mapAlerts(
  alerts: GrafanaAlertmanagerAlert[],
  selectors: Record<string, string>,
): GrafanaOperationalSnapshot["alerts"] {
  return alerts
    .filter((a) => matchesLabelSelectors(a.labels, selectors))
    .map((a) => ({
      fingerprint: a.fingerprint,
      alertname: a.labels.alertname ?? "unknown",
      severity: a.labels.severity ?? "unknown",
      state: normalizeAlertState(a),
      service: a.labels.service ?? a.labels.job,
      startsAt: a.startsAt,
      dashboardUid: a.labels.dashboard_uid ?? a.labels.dashboardUid,
    }));
}

async function fetchDashboardHealth(
  grafanaUrl: string,
  auth: NonNullable<ReturnType<typeof getGrafanaAuth>>,
  dashboards: Array<{ uid: string; title: string; folderTitle?: string }>,
): Promise<GrafanaOperationalSnapshot["dashboards"]> {
  const results: GrafanaOperationalSnapshot["dashboards"] = [];

  for (const dash of dashboards) {
    try {
      const response = await getGrafanaDashboard(grafanaUrl, auth, dash.uid);
      const panels = response.dashboard?.panels;
      const panelCount = countDashboardPanels(panels);
      const missingDatasource = dashboardHasMissingDatasource(panels);
      const hasRecentData = panelCount > 0 && !missingDatasource;

      results.push({
        uid: dash.uid,
        title: response.dashboard?.title ?? dash.title,
        hasRecentData,
        panelCount,
        missingDatasource: missingDatasource || undefined,
      });
    } catch {
      results.push({
        uid: dash.uid,
        title: dash.title,
        hasRecentData: false,
        panelCount: 0,
        missingDatasource: true,
      });
    }
  }

  return results;
}

function buildTelemetryMetrics(
  organizationId: string,
  snapshot: GrafanaOperationalSnapshot,
  metricsSnapshot?: ObservabilityAnalysisSnapshot | null,
  metricsProvenance?: MetricsProvenance | null,
) {
  const { kpis } = snapshot;
  const base = {
    organizationId,
    source: GRAFANA_SOURCE,
    labelsJson: JSON.stringify({ grafanaUrl: snapshot.grafanaUrl }),
  };

  const rows = [
    { ...base, metricKey: "open_alerts", value: kpis.openAlerts, unit: "count" },
    { ...base, metricKey: "firing_critical", value: kpis.firingCritical, unit: "count" },
    {
      ...base,
      metricKey: "dashboard_coverage_pct",
      value: kpis.dashboardCoveragePct,
      unit: "percent",
    },
    {
      ...base,
      metricKey: "annotation_count_24h",
      value: kpis.annotations24h,
      unit: "count",
    },
    { ...base, metricKey: "health_score", value: kpis.healthScore, unit: "score" },
  ];

  if (metricsSnapshot?.kpis && metricsProvenance) {
    const proxyLabels = JSON.stringify({
      grafanaUrl: snapshot.grafanaUrl,
      path: metricsProvenance.path,
      datasourceUid: metricsProvenance.datasourceUid,
    });
    const proxyBase = {
      organizationId,
      source: GRAFANA_SOURCE,
      labelsJson: proxyLabels,
    };
    rows.push(
      { ...proxyBase, metricKey: "proxy_health_score", value: metricsSnapshot.kpis.healthScore, unit: "score" },
      { ...proxyBase, metricKey: "proxy_error_rate", value: metricsSnapshot.kpis.errorRate, unit: "percent" },
      { ...proxyBase, metricKey: "proxy_p95_latency_ms", value: metricsSnapshot.kpis.p95LatencyMs, unit: "ms" },
    );
  }

  return rows;
}

async function syncGrafanaProxyMetrics(input: {
  organizationId: string;
  grafanaUrl: string;
  auth: NonNullable<ReturnType<typeof getGrafanaAuth>>;
  meta: ReturnType<typeof parseGrafanaMeta>;
}): Promise<{
  metricsSnapshot: ObservabilityAnalysisSnapshot;
  metricsProvenance: MetricsProvenance;
  metricsSummary: string;
} | null> {
  const dsUid = input.meta.prometheusDatasource?.uid;
  if (!dsUid) return null;

  const ds = await getGrafanaDatasourceByUid(input.grafanaUrl, input.auth, dsUid);
  if (!ds || ds.type !== "prometheus") {
    throw new Error("Prometheus datasource not found — re-select on Integrations");
  }

  const transport = createGrafanaPrometheusProxyTransport({
    grafanaUrl: input.grafanaUrl,
    auth: input.auth,
    datasourceUid: dsUid,
  });

  const provenance: MetricsProvenance = {
    path: "grafana-datasource-proxy",
    grafanaUrl: input.grafanaUrl,
    datasourceUid: ds.uid,
    datasourceName: ds.name,
  };

  const metricsSnapshot = await runPromqlSync({
    transport,
    serviceScopes: input.meta.metricsServiceScopes ?? [],
    promqlOverrides: input.meta.promqlOverrides,
    previousSnapshot: input.meta.metricsSnapshot ?? null,
    provenance,
    prometheusUrlLabel: `grafana-proxy://${ds.uid}`,
  });

  const metricsSummary = formatMetricsSyncSummary({ provenance, snapshot: metricsSnapshot });

  return { metricsSnapshot, metricsProvenance: provenance, metricsSummary };
}

export async function syncGrafanaIntegration(input: {
  organizationId: string;
  userId: string;
}) {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "GRAFANA",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("Grafana is not connected");
  }

  const meta = parseGrafanaMeta(integration.metadataJson);
  const grafanaUrl = meta.grafanaUrl;
  if (!grafanaUrl) throw new Error("Grafana URL is missing");

  const auth = getGrafanaAuth(integration);
  if (!auth) throw new Error("Grafana credentials are missing");

  const dashboardScopes = resolveSyncDashboardScopes({
    metaScopes: meta.dashboardScopes,
  });

  const expandedDashboards = await expandGrafanaScopesToDashboardUids({
    grafanaUrl,
    auth,
    scopes: dashboardScopes,
    tagFilter: meta.tagFilter,
  });

  if (expandedDashboards.length === 0) {
    throw new Error("No dashboards found in the selected scopes");
  }

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const [rawAlerts, annotations, dashboardHealth] = await Promise.all([
    listGrafanaAlerts(grafanaUrl, auth),
    listGrafanaAnnotations(grafanaUrl, auth, dayAgo, now),
    fetchDashboardHealth(grafanaUrl, auth, expandedDashboards),
  ]);

  const selectors = meta.alertLabelSelectors ?? {};
  const alerts = mapAlerts(rawAlerts, selectors);
  const firingAlerts = alerts.filter((a) => a.state === "firing");
  const openAlerts = firingAlerts.length;
  const firingCritical = firingAlerts.filter(
    (a) => a.severity.toLowerCase() === "critical",
  ).length;

  const snapshot = buildGrafanaSnapshot({
    grafanaUrl,
    dashboardScopes,
    dashboards: dashboardHealth,
    alerts,
    annotations24h: annotations.length,
    openAlerts,
    firingCritical,
  });

  let metricsResult: Awaited<ReturnType<typeof syncGrafanaProxyMetrics>> = null;
  let metricsLastError: string | undefined;

  if (meta.prometheusDatasource?.uid) {
    try {
      metricsResult = await syncGrafanaProxyMetrics({
        organizationId: input.organizationId,
        grafanaUrl,
        auth,
        meta,
      });
    } catch (err) {
      metricsLastError = err instanceof Error ? err.message : "Metrics sync failed";
      if (metricsLastError.includes("not found")) {
        throw err;
      }
    }
  }

  let summary = `Synced ${expandedDashboards.length} dashboard(s) · ${openAlerts} firing alert(s) · health ${snapshot.kpis.healthScore}`;
  if (metricsResult) {
    summary = `Synced ${expandedDashboards.length} dashboard(s) · ${openAlerts} alert(s) · ${metricsResult.metricsSummary}`;
  }

  const telemetryEvents: Parameters<typeof ingestNormalizedEvents>[0]["events"] = [
    {
      eventType: "observability",
      source: "grafana",
      severity: firingCritical > 0 ? "critical" : openAlerts > 0 ? "warning" : "info",
      payload: {
        action: "sync.completed",
        openAlerts,
        firingCritical,
        dashboardCoveragePct: snapshot.kpis.dashboardCoveragePct,
        healthScore: snapshot.kpis.healthScore,
      },
    },
  ];

  if (firingAlerts.length > 0) {
    for (const alert of firingAlerts.slice(0, 10)) {
      telemetryEvents.push({
        eventType: "observability",
        source: "grafana",
        severity: alert.severity.toLowerCase() === "critical" ? "critical" : "warning",
        service: alert.service,
        payload: {
          action: "alert.firing",
          alertname: alert.alertname,
          fingerprint: alert.fingerprint,
          severity: alert.severity,
        },
      });
    }
  }

  await ingestNormalizedEvents({
    organizationId: input.organizationId,
    userId: input.userId,
    events: telemetryEvents,
  });

  const metrics = buildTelemetryMetrics(
    input.organizationId,
    snapshot,
    metricsResult?.metricsSnapshot,
    metricsResult?.metricsProvenance,
  );

  const metadataJson = mergeGrafanaMeta(meta, {
    operationalSnapshot: snapshot,
    lastSyncSummary: summary,
    lastError: undefined,
    metricsSnapshot: metricsResult?.metricsSnapshot,
    metricsProvenance: metricsResult?.metricsProvenance,
    metricsLastSyncSummary: metricsResult?.metricsSummary,
    metricsLastError,
  });

  await prisma.$transaction(async (tx) => {
    await tx.telemetryMetric.createMany({ data: metrics });

    await tx.integration.update({
      where: { id: integration.id },
      data: {
        metadataJson,
        lastSyncAt: new Date(),
        lastError: null,
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "integration.synced",
        title: "Grafana observability snapshot synchronized",
        description: summary,
        metadataJson: JSON.stringify({
          provider: "GRAFANA",
          dashboardCount: expandedDashboards.length,
          openAlerts,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: metricsResult
          ? "grafana.metrics_sync.completed"
          : "integration.grafana.synced",
        entityType: "Integration",
        entityId: integration.id,
        metadataJson: JSON.stringify({
          dashboardCount: expandedDashboards.length,
          openAlerts,
          healthScore: snapshot.kpis.healthScore,
          metricsSynced: Boolean(metricsResult),
          metricsHealthScore: metricsResult?.metricsSnapshot.kpis.healthScore,
        }),
        actorType: determineActorType(input.userId, metricsResult ? "grafana.metrics_sync.completed" : "integration.grafana.synced"),
      },
    });
  });

  await markIntegrationSync(input.organizationId, "GRAFANA");

  invalidateExecutiveBriefingSnapshot(input.organizationId);

  return {
    summary,
    syncedAt: snapshot.generatedAt,
    dashboardCount: expandedDashboards.length,
    openAlerts,
    snapshot,
  };
}
