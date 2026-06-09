import type { Integration } from "@/generated/prisma/client";
import type { GrafanaAssessContext } from "@/lib/grafana-assess-context";
import { resolveGrafanaAssessContext } from "@/lib/grafana-assess-context";
import { isGrafanaTrulyConnected } from "@/lib/grafana-meta";
import { isPrometheusTrulyConnected, parsePrometheusMeta } from "@/lib/prometheus-meta";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";

export type LiveObservabilityStatus = {
  grafana: boolean;
  prometheus: boolean;
  any: boolean;
};

export type PrometheusAssessContext = {
  connected: boolean;
  synced: boolean;
  snapshot: ObservabilityAnalysisSnapshot | null;
};

export type ObservabilityAssessContext = {
  grafana: GrafanaAssessContext | null;
  prometheus: PrometheusAssessContext | null;
};

export function hasLiveObservability(input: {
  integrations: Integration[];
  tools?: string[];
}): LiveObservabilityStatus {
  const grafanaIntegration = input.integrations.find((i) => i.provider === "GRAFANA");
  const prometheusIntegration = input.integrations.find((i) => i.provider === "PROMETHEUS");

  const grafana = isGrafanaTrulyConnected(grafanaIntegration);
  const prometheus = isPrometheusTrulyConnected(prometheusIntegration);

  return {
    grafana,
    prometheus,
    any: grafana || prometheus,
  };
}

export function resolvePrometheusAssessContext(input: {
  integrations: Integration[];
}): PrometheusAssessContext {
  const prometheus = input.integrations.find((i) => i.provider === "PROMETHEUS");

  if (!prometheus || !isPrometheusTrulyConnected(prometheus)) {
    return { connected: false, synced: false, snapshot: null };
  }

  const meta = parsePrometheusMeta(prometheus.metadataJson);
  const snapshot = (meta.operationalSnapshot as ObservabilityAnalysisSnapshot | undefined) ?? null;

  if (!snapshot?.kpis) {
    return { connected: true, synced: false, snapshot: null };
  }

  return { connected: true, synced: true, snapshot };
}

export function resolveObservabilityContext(input: {
  integrations: Integration[];
}): ObservabilityAssessContext {
  const grafana = resolveGrafanaAssessContext(input);
  const prometheus = resolvePrometheusAssessContext(input);

  return {
    grafana: grafana.connected ? grafana : null,
    prometheus: prometheus.connected ? prometheus : null,
  };
}

export function formatObservabilityCoverage(
  grafana: GrafanaAssessContext | null,
  prometheus: PrometheusAssessContext | null,
): string {
  const parts: string[] = [];

  if (prometheus?.synced && prometheus.snapshot) {
    parts.push(
      `Prometheus synced (health ${prometheus.snapshot.kpis.healthScore}/100)`,
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

export function formatErrorRateDelta(prometheus: PrometheusAssessContext | null): string {
  const delta = prometheus?.snapshot?.kpis.errorRateDelta;
  if (delta == null) return "unknown";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}%`;
}

export { isGrafanaTrulyConnected } from "@/lib/grafana-meta";
export { isPrometheusTrulyConnected } from "@/lib/prometheus-meta";
