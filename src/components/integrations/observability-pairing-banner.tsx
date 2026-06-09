import { Badge } from "@/components/ui/badge";
import { formatMetricsSourceLabel } from "@/lib/observability-metrics/format-source-label";
import type { MetricsProvenance } from "@/lib/observability-metrics/types";

export function ObservabilityPairingBanner({
  grafanaTrulyConnected,
  grafanaProxyConfigured,
  grafanaDatasourceName,
  prometheusTrulyConnected,
  metricsProvenance,
}: {
  grafanaTrulyConnected: boolean;
  grafanaProxyConfigured: boolean;
  grafanaDatasourceName?: string;
  prometheusTrulyConnected: boolean;
  metricsProvenance?: MetricsProvenance | null;
}) {
  if (!grafanaTrulyConnected && !prometheusTrulyConnected) {
    return null;
  }

  let message: string;
  let variant: "brand" | "success" | "muted" = "brand";

  if (prometheusTrulyConnected && grafanaTrulyConnected) {
    message = "Dual source: Prometheus metrics · Grafana alerts";
    variant = "success";
  } else if (grafanaTrulyConnected && grafanaProxyConfigured) {
    message = metricsProvenance
      ? formatMetricsSourceLabel(metricsProvenance)
      : `Metrics via Grafana → ${grafanaDatasourceName ?? "Prometheus"}`;
    variant = "success";
  } else if (grafanaTrulyConnected) {
    message = "Prometheus on a private network? Query metrics through Grafana.";
  } else {
    message = "Direct Prometheus connected for metric KPIs.";
    variant = "success";
  }

  return (
    <div className="rounded-lg border border-border bg-elevated/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={variant}>Observability</Badge>
        <p className="text-sm text-secondary">{message}</p>
      </div>
    </div>
  );
}
