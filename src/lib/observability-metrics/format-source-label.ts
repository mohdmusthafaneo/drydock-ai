import type { MetricsProvenance } from "@/lib/observability-metrics/types";

export function formatMetricsSourceLabel(provenance: MetricsProvenance | null | undefined): string {
  if (!provenance) return "Unknown metrics source";

  if (provenance.path === "prometheus-direct") {
    const host = provenance.prometheusUrl?.replace(/^https?:\/\//, "") ?? "Prometheus";
    return `Prometheus direct (${host})`;
  }

  const dsName = provenance.datasourceName ?? provenance.datasourceUid ?? "Prometheus";
  return `Metrics via Grafana → ${dsName}`;
}

export function formatMetricsSourceShort(provenance: MetricsProvenance | null | undefined): string {
  if (!provenance) return "metrics";

  if (provenance.path === "prometheus-direct") {
    return "Prometheus";
  }

  const dsName = provenance.datasourceName ?? "Prometheus";
  return `Grafana→${dsName}`;
}
