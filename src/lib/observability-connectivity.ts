import type { Integration } from "@/generated/prisma/client";
import type { GrafanaAssessContext } from "@/lib/grafana-assess-context";
import { resolveGrafanaAssessContext } from "@/lib/grafana-assess-context";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
import { isPrometheusTrulyConnected, parsePrometheusMeta } from "@/lib/prometheus-meta";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import type { MetricsAssessContext, MetricsProvenance } from "@/lib/observability-metrics/types";
export type { MetricsAssessContext, MetricsProvenance } from "@/lib/observability-metrics/types";
import { formatMetricsSourceShort } from "@/lib/observability-metrics/format-source-label";

export type LiveObservabilityStatus = {
  grafana: boolean;
  prometheus: boolean;
  grafanaMetricsProxy: boolean;
  any: boolean;
};

export type PrometheusAssessContext = {
  connected: boolean;
  synced: boolean;
  snapshot: ObservabilityAnalysisSnapshot | null;
  provenance?: MetricsProvenance | null;
};

export type ObservabilityAssessContext = {
  grafana: GrafanaAssessContext | null;
  prometheus: PrometheusAssessContext | null;
  metrics: MetricsAssessContext;
};

export function hasGrafanaMetricsProxy(integrations: Integration[]): boolean {
  const grafana = integrations.find((i) => i.provider === "GRAFANA");
  if (!isGrafanaTrulyConnected(grafana)) return false;
  const meta = parseGrafanaMeta(grafana!.metadataJson);
  return Boolean(meta.metricsSnapshot?.kpis && meta.prometheusDatasource?.uid);
}

export function hasLiveObservability(input: {
  integrations: Integration[];
  tools?: string[];
}): LiveObservabilityStatus {
  const grafanaIntegration = input.integrations.find((i) => i.provider === "GRAFANA");
  const prometheusIntegration = input.integrations.find((i) => i.provider === "PROMETHEUS");

  const grafana = isGrafanaTrulyConnected(grafanaIntegration);
  const prometheus = isPrometheusTrulyConnected(prometheusIntegration);
  const grafanaMetricsProxy = hasGrafanaMetricsProxy(input.integrations);

  return {
    grafana,
    prometheus,
    grafanaMetricsProxy,
    any: grafana || prometheus || grafanaMetricsProxy,
  };
}

type IntegrationMetricsSlice = Pick<Integration, "provider" | "status" | "metadataJson">;

export function hasObservabilitySynced(integrations: IntegrationMetricsSlice[]): boolean {
  return resolveMetricsAssessContext({ integrations }).synced;
}

export function scopeMetricsContext(
  metrics: MetricsAssessContext,
  serviceScopeIds: string[] | null | undefined,
): MetricsAssessContext {
  if (!serviceScopeIds?.length || !metrics.synced || !metrics.snapshot?.byService?.length) {
    return metrics;
  }

  const scoped = metrics.snapshot.byService.filter(
    (row) => serviceScopeIds.includes(row.id) || serviceScopeIds.includes(row.label),
  );
  if (scoped.length === 0) return metrics;

  const avgHealth = Math.round(
    scoped.reduce((sum, row) => sum + row.healthScore, 0) / scoped.length,
  );
  const avgError = scoped.reduce((sum, row) => sum + row.errorRate, 0) / scoped.length;
  const maxP95 = Math.max(...scoped.map((row) => row.p95LatencyMs));
  const totalAlerts = scoped.reduce((sum, row) => sum + row.openAlerts, 0);

  return {
    ...metrics,
    snapshot: {
      ...metrics.snapshot,
      kpis: {
        ...metrics.snapshot.kpis,
        healthScore: avgHealth,
        errorRate: avgError,
        p95LatencyMs: maxP95,
        openAlerts: totalAlerts,
      },
    },
  };
}

export function resolveMetricsAssessContext(input: {
  integrations: IntegrationMetricsSlice[];
}): MetricsAssessContext {
  const prometheus = input.integrations.find((i) => i.provider === "PROMETHEUS");
  const grafana = input.integrations.find((i) => i.provider === "GRAFANA");

  if (prometheus && isPrometheusTrulyConnected(prometheus)) {
    const meta = parsePrometheusMeta(prometheus.metadataJson);
    const snapshot = (meta.operationalSnapshot as ObservabilityAnalysisSnapshot | undefined) ?? null;
    if (snapshot?.kpis) {
      const provenance: MetricsProvenance = meta.metricsProvenance ?? {
        path: "prometheus-direct",
        prometheusUrl: meta.prometheusUrl,
      };
      return { provenance, synced: true, snapshot: { ...snapshot, provenance } };
    }
  }

  if (grafana && isGrafanaTrulyConnected(grafana)) {
    const meta = parseGrafanaMeta(grafana.metadataJson);
    if (meta.metricsSnapshot?.kpis && meta.prometheusDatasource?.uid) {
      const provenance: MetricsProvenance = meta.metricsProvenance ?? {
        path: "grafana-datasource-proxy",
        grafanaUrl: meta.grafanaUrl,
        datasourceUid: meta.prometheusDatasource.uid,
        datasourceName: meta.prometheusDatasource.name,
      };
      return {
        provenance,
        synced: true,
        snapshot: { ...meta.metricsSnapshot, provenance },
      };
    }
  }

  if (
    (prometheus && isPrometheusTrulyConnected(prometheus)) ||
    (grafana && isGrafanaTrulyConnected(grafana))
  ) {
    return { provenance: null, synced: false, snapshot: null };
  }

  return { provenance: null, synced: false, snapshot: null };
}

export function resolvePrometheusAssessContext(input: {
  integrations: Integration[];
}): PrometheusAssessContext {
  const metrics = resolveMetricsAssessContext(input);
  const prometheus = input.integrations.find((i) => i.provider === "PROMETHEUS");
  const connected = Boolean(prometheus && isPrometheusTrulyConnected(prometheus));

  if (metrics.provenance?.path === "prometheus-direct" && metrics.synced) {
    return {
      connected: true,
      synced: true,
      snapshot: metrics.snapshot,
      provenance: metrics.provenance,
    };
  }

  if (!connected) {
    return { connected: false, synced: false, snapshot: null };
  }

  return { connected: true, synced: false, snapshot: null };
}

export function resolveObservabilityContext(input: {
  integrations: Integration[];
}): ObservabilityAssessContext {
  const grafana = resolveGrafanaAssessContext(input);
  const prometheus = resolvePrometheusAssessContext(input);
  const metrics = resolveMetricsAssessContext(input);

  return {
    grafana: grafana.connected ? grafana : null,
    prometheus: prometheus.connected ? prometheus : null,
    metrics,
  };
}

export function formatObservabilityCoverage(
  grafana: GrafanaAssessContext | null,
  prometheus: PrometheusAssessContext | null,
  metrics?: MetricsAssessContext | null,
): string {
  const parts: string[] = [];
  const metricsCtx = metrics ?? resolveMetricsAssessContext({ integrations: [] });

  if (metricsCtx.synced && metricsCtx.snapshot && metricsCtx.provenance) {
    const source = formatMetricsSourceShort(metricsCtx.provenance);
    parts.push(
      `${source} synced (health ${metricsCtx.snapshot.kpis.healthScore}/100)`,
    );
  } else if (prometheus?.connected) {
    parts.push("Prometheus connected — run sync on Integrations");
  }

  if (grafana?.synced && grafana.snapshot) {
    parts.push(
      `Grafana synced (${grafana.openAlerts} open alert${grafana.openAlerts === 1 ? "" : "s"})`,
    );
  } else if (grafana?.connected) {
    parts.push("Grafana connected — run sync on Integrations");
  }

  if (parts.length === 0) return "Not connected";
  return parts.join("; ");
}

export function formatErrorRateDelta(
  prometheus: PrometheusAssessContext | null,
  metrics?: MetricsAssessContext | null,
): string {
  const snapshot =
    metrics?.snapshot ??
    (prometheus?.provenance?.path === "prometheus-direct" ? prometheus.snapshot : null);
  const delta = snapshot?.kpis.errorRateDelta;
  if (delta == null) return "unknown";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}%`;
}

export { isGrafanaTrulyConnected } from "@/lib/grafana-meta";
export { isPrometheusTrulyConnected } from "@/lib/prometheus-meta";
