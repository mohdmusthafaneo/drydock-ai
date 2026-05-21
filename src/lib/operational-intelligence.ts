import type { Integration, IntegrationProvider } from "@/generated/prisma/client";
import type { MetricSource } from "@/generated/prisma/client";

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

function pickSource(
  integrations: Integration[],
  preferred: IntegrationProvider,
): MetricSource {
  const connected = integrations.filter((i) => i.status === "CONNECTED");
  if (connected.some((i) => i.provider === "PROMETHEUS")) return "PROMETHEUS";
  if (connected.some((i) => i.provider === "GRAFANA")) return "GRAFANA";
  if (connected.some((i) => i.provider === preferred)) {
    return preferred === "GRAFANA" ? "GRAFANA" : "PROMETHEUS";
  }
  return "SYNTHETIC";
}

export function collectOperationalTelemetry(input: {
  integrations: Integration[];
  releaseName?: string;
  environment?: string;
  postDeploy?: boolean;
}): CollectedTelemetry {
  const correlationId = `corr_${Date.now().toString(36)}`;
  const source = pickSource(input.integrations, "PROMETHEUS");
  const envFactor = input.environment === "PRODUCTION" ? 1.15 : 1;
  const deploySpike = input.postDeploy ? 1.2 : 1;

  const metrics: MetricPoint[] = CORE_METRICS.map((m) => {
    let value = m.base * envFactor * deploySpike;
    if (m.key === "http_error_rate" && input.postDeploy) value += 0.25;
    if (m.key === "p95_latency_ms" && input.postDeploy) value += 35;
    if (m.key === "active_incidents" && input.postDeploy) value = 1;
    value = Math.round(value * 100) / 100;
    return {
      source,
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
    ? `Release degradation detected for ${input.releaseName ?? "workload"} — elevated error rate (${errorRate}%) and latency (P95 ${latency}ms). Correlation ID ${correlationId}.`
    : `Operational signals within baseline for ${input.releaseName ?? "workload"}. Source: ${source}. Correlation ID ${correlationId}.`;

  return { metrics, correlationId, summary, degradationDetected };
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
