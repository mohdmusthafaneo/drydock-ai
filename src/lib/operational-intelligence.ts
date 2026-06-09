import type { Integration, MetricSource } from "@/generated/prisma/client";
import {
  isGrafanaTrulyConnected,
  parseGrafanaMeta,
  type GrafanaOperationalSnapshot,
} from "@/lib/grafana-meta";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import { isPrometheusTrulyConnected, parsePrometheusMeta } from "@/lib/prometheus-meta";

export type MetricPoint = {
  source: MetricSource;
  metricKey: string;
  value: number;
  unit: string;
  labels?: Record<string, string>;
};

export type CollectedTelemetry = {
  metrics: MetricPoint[];
  correlationId: string;
  summary: string;
  degradationDetected: boolean;
};

const CORE_METRICS = [
  { key: "http_error_rate", unit: "%", base: 0.4 },
  { key: "p95_latency_ms", unit: "ms", base: 180 },
  { key: "cpu_utilization", unit: "%", base: 42 },
  { key: "memory_utilization", unit: "%", base: 58 },
  { key: "deployment_success_rate", unit: "%", base: 96 },
  { key: "active_incidents", unit: "count", base: 0 },
] as const;

function buildFromPrometheusSnapshot(input: {
  snapshot: ObservabilityAnalysisSnapshot;
  releaseName?: string;
  environment?: string;
  postDeploy?: boolean;
  correlationId: string;
}): CollectedTelemetry {
  const { kpis } = input.snapshot;
  const labels = {
    release: input.releaseName ?? "platform",
    environment: input.environment ?? "staging",
  };

  const metrics: MetricPoint[] = [
    {
      source: "PROMETHEUS",
      metricKey: "http_error_rate",
      value: kpis.errorRate,
      unit: "%",
      labels,
    },
    {
      source: "PROMETHEUS",
      metricKey: "p95_latency_ms",
      value: kpis.p95LatencyMs,
      unit: "ms",
      labels,
    },
    {
      source: "PROMETHEUS",
      metricKey: "cpu_utilization",
      value: kpis.cpuUtilizationPct ?? 0,
      unit: "%",
      labels,
    },
    {
      source: "PROMETHEUS",
      metricKey: "memory_utilization",
      value: kpis.memoryUtilizationPct ?? 0,
      unit: "%",
      labels,
    },
    {
      source: "PROMETHEUS",
      metricKey: "deployment_success_rate",
      value: Math.max(0, Math.min(100, kpis.healthScore)),
      unit: "%",
      labels,
    },
    {
      source: "PROMETHEUS",
      metricKey: "active_incidents",
      value: kpis.openAlerts,
      unit: "count",
      labels,
    },
  ];

  const degradationDetected =
    kpis.errorRate > 0.8 ||
    kpis.p95LatencyMs > 220 ||
    kpis.openAlerts > 0 ||
    (input.postDeploy === true && (kpis.errorRateDelta ?? 0) > 0.3);

  const summary = degradationDetected
    ? `Release degradation detected for ${input.releaseName ?? "workload"} — Prometheus error rate ${kpis.errorRate}%, P95 ${kpis.p95LatencyMs}ms, ${kpis.openAlerts} alert(s). Correlation ID ${input.correlationId}.`
    : `Operational signals within baseline for ${input.releaseName ?? "workload"}. Source: PROMETHEUS. Correlation ID ${input.correlationId}.`;

  return { metrics, correlationId: input.correlationId, summary, degradationDetected };
}

function buildFromGrafanaSnapshot(input: {
  snapshot: GrafanaOperationalSnapshot;
  releaseName?: string;
  environment?: string;
  postDeploy?: boolean;
  correlationId: string;
}): CollectedTelemetry {
  const { kpis } = input.snapshot;
  const labels = {
    release: input.releaseName ?? "platform",
    environment: input.environment ?? "staging",
  };

  const metrics: MetricPoint[] = [
    {
      source: "GRAFANA",
      metricKey: "open_alerts",
      value: kpis.openAlerts,
      unit: "count",
      labels,
    },
    {
      source: "GRAFANA",
      metricKey: "firing_critical",
      value: kpis.firingCritical,
      unit: "count",
      labels,
    },
    {
      source: "GRAFANA",
      metricKey: "dashboard_coverage_pct",
      value: kpis.dashboardCoveragePct,
      unit: "percent",
      labels,
    },
    {
      source: "GRAFANA",
      metricKey: "annotation_count_24h",
      value: kpis.annotations24h,
      unit: "count",
      labels,
    },
    {
      source: "GRAFANA",
      metricKey: "health_score",
      value: kpis.healthScore,
      unit: "score",
      labels,
    },
    {
      source: "GRAFANA",
      metricKey: "active_incidents",
      value: kpis.openAlerts,
      unit: "count",
      labels,
    },
  ];

  const degradationDetected =
    kpis.openAlerts > 0 ||
    kpis.firingCritical > 0 ||
    kpis.healthScore < 60 ||
    (input.postDeploy === true && kpis.openAlerts > 0);

  const summary = degradationDetected
    ? `Release degradation detected for ${input.releaseName ?? "workload"} — ${kpis.openAlerts} Grafana alert(s) firing, health ${kpis.healthScore}/100. Correlation ID ${input.correlationId}.`
    : `Operational signals within baseline for ${input.releaseName ?? "workload"}. Source: GRAFANA. Correlation ID ${input.correlationId}.`;

  return { metrics, correlationId: input.correlationId, summary, degradationDetected };
}

function collectSyntheticTelemetry(input: {
  integrations: Integration[];
  releaseName?: string;
  environment?: string;
  postDeploy?: boolean;
  correlationId: string;
}): CollectedTelemetry {
  const connected = input.integrations.filter((i) => i.status === "CONNECTED");
  const source: MetricSource = connected.some((i) => i.provider === "PROMETHEUS")
    ? "PROMETHEUS"
    : connected.some((i) => i.provider === "GRAFANA")
      ? "GRAFANA"
      : "SYNTHETIC";

  const envFactor = input.environment === "PRODUCTION" ? 1.15 : 1;
  const deploySpike = input.postDeploy ? 1.2 : 1;

  const metrics: MetricPoint[] = CORE_METRICS.map((m) => {
    let value = m.base * envFactor * deploySpike;
    if (m.key === "http_error_rate" && input.postDeploy) value += 0.25;
    if (m.key === "p95_latency_ms" && input.postDeploy) value += 35;
    if (m.key === "active_incidents" && input.postDeploy) value = 1;
    value = Math.round(value * 100) / 100;
    return {
      source: "SYNTHETIC",
      metricKey: m.key,
      value,
      unit: m.unit,
      labels: {
        release: input.releaseName ?? "platform",
        environment: input.environment ?? "staging",
      },
    };
  });

  const errorRate = metrics.find((m) => m.metricKey === "http_error_rate")?.value ?? 0;
  const latency = metrics.find((m) => m.metricKey === "p95_latency_ms")?.value ?? 0;
  const degradationDetected = errorRate > 0.8 || latency > 220;

  const summary = degradationDetected
    ? `Release degradation detected for ${input.releaseName ?? "workload"} — elevated error rate (${errorRate}%) and latency (P95 ${latency}ms). Correlation ID ${input.correlationId}.`
    : `Operational signals within baseline for ${input.releaseName ?? "workload"}. Source: ${source} (synthetic fallback). Correlation ID ${input.correlationId}.`;

  return { metrics, correlationId: input.correlationId, summary, degradationDetected };
}

export function collectOperationalTelemetry(input: {
  integrations: Integration[];
  releaseName?: string;
  environment?: string;
  postDeploy?: boolean;
}): CollectedTelemetry {
  const correlationId = `corr_${Date.now().toString(36)}`;

  const prometheus = input.integrations.find((i) => i.provider === "PROMETHEUS");
  if (isPrometheusTrulyConnected(prometheus)) {
    const meta = parsePrometheusMeta(prometheus!.metadataJson);
    const snapshot = meta.operationalSnapshot as ObservabilityAnalysisSnapshot | undefined;
    if (snapshot?.kpis) {
      return buildFromPrometheusSnapshot({
        snapshot,
        releaseName: input.releaseName,
        environment: input.environment,
        postDeploy: input.postDeploy,
        correlationId,
      });
    }
  }

  const grafana = input.integrations.find((i) => i.provider === "GRAFANA");
  if (isGrafanaTrulyConnected(grafana)) {
    const meta = parseGrafanaMeta(grafana!.metadataJson);
    if (meta.operationalSnapshot) {
      return buildFromGrafanaSnapshot({
        snapshot: meta.operationalSnapshot,
        releaseName: input.releaseName,
        environment: input.environment,
        postDeploy: input.postDeploy,
        correlationId,
      });
    }
  }

  return collectSyntheticTelemetry({ ...input, correlationId });
}

export function correlateIncidentFromTelemetry(input: {
  correlationId: string;
  releaseId: string;
  releaseName: string;
  summary: string;
  severityScore: number;
  source: MetricSource;
  services: string[];
}) {
  return {
    correlationId: input.correlationId,
    releaseId: input.releaseId,
    title: `Correlated incident: ${input.releaseName}`,
    description: input.summary,
    severityScore: input.severityScore,
    source: input.source,
    affectedServicesJson: JSON.stringify(input.services),
  };
}
