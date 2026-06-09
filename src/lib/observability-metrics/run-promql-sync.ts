import type {
  ObservabilityAnalysisSnapshot,
  PrometheusOperationalGap,
  PrometheusOperationalSignal,
  PrometheusServiceScope,
} from "@/lib/observability-analysis/types";
import type {
  MetricsProvenance,
  MetricsQueryTransport,
  PrometheusQueryResult,
  PrometheusQueryVectorResult,
} from "@/lib/observability-metrics/types";
import {
  MAX_CONCURRENT_PROMQL_TEMPLATES,
  PROMQL_TEMPLATES,
  resolveTemplateQuery,
  V1_SYNC_TEMPLATE_IDS,
  type PromqlTemplateId,
} from "@/lib/prometheus/promql-templates";

export function extractScalarFromQueryResult(result: PrometheusQueryResult): number | null {
  if (result.resultType === "scalar" && result.scalarValue != null) {
    return result.scalarValue;
  }

  const vectors = result.result as PrometheusQueryVectorResult[];
  if (!vectors?.length) return null;

  const raw = vectors[0]?.value?.[1];
  if (raw == null) return null;

  const num = Number.parseFloat(raw);
  return Number.isFinite(num) ? num : null;
}

function computeHealthScore(input: {
  errorRate: number;
  p95LatencyMs: number;
  upTargets: number | null;
}): number {
  let score = 100;
  if (input.errorRate > 1) score -= 30;
  else if (input.errorRate > 0.5) score -= 15;
  else if (input.errorRate > 0.1) score -= 5;

  if (input.p95LatencyMs > 500) score -= 25;
  else if (input.p95LatencyMs > 200) score -= 10;
  else if (input.p95LatencyMs > 100) score -= 3;

  if (input.upTargets === 0) score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeDeltas(
  current: ObservabilityAnalysisSnapshot["kpis"],
  previous: ObservabilityAnalysisSnapshot | null | undefined,
): ObservabilityAnalysisSnapshot["kpis"] {
  if (!previous?.kpis) return current;

  return {
    ...current,
    healthScoreDelta: current.healthScore - previous.kpis.healthScore,
    errorRateDelta: Math.round((current.errorRate - previous.kpis.errorRate) * 100) / 100,
    p95LatencyDelta: Math.round(current.p95LatencyMs - previous.kpis.p95LatencyMs),
    openAlertsDelta: current.openAlerts - previous.kpis.openAlerts,
  };
}

export async function runPromqlSync(input: {
  transport: MetricsQueryTransport;
  serviceScopes: PrometheusServiceScope[];
  promqlOverrides?: Record<string, string>;
  previousSnapshot?: ObservabilityAnalysisSnapshot | null;
  provenance: MetricsProvenance;
  prometheusUrlLabel: string;
}): Promise<ObservabilityAnalysisSnapshot> {
  const gaps: PrometheusOperationalGap[] = [];
  const templateIds = V1_SYNC_TEMPLATE_IDS.slice(0, MAX_CONCURRENT_PROMQL_TEMPLATES);

  const values: Partial<Record<PromqlTemplateId, number | null>> = {};

  for (const templateId of templateIds) {
    const promql = resolveTemplateQuery(templateId, input.serviceScopes, input.promqlOverrides);
    try {
      const result = await input.transport.queryInstant(promql);
      values[templateId] = extractScalarFromQueryResult(result);
    } catch (err) {
      const template = PROMQL_TEMPLATES.find((t) => t.id === templateId);
      gaps.push({
        area: "Observability",
        gap: `Failed to query ${template?.id ?? templateId}: ${err instanceof Error ? err.message : "unknown error"}`,
        priority: templateId === "up" ? "high" : "medium",
      });
      values[templateId] = null;
    }
  }

  const errorRateRaw = values.error_rate ?? 0;
  const errorRate = errorRateRaw <= 1 ? errorRateRaw * 100 : errorRateRaw;
  const p95LatencySec = values.p95_latency ?? 0;
  const p95LatencyMs = Math.round(p95LatencySec * 1000);
  const upTargets = values.up ?? null;

  const healthScore = computeHealthScore({
    errorRate,
    p95LatencyMs,
    upTargets,
  });

  const kpisBase = {
    healthScore,
    errorRate: Math.round(errorRate * 100) / 100,
    p95LatencyMs,
    openAlerts: 0,
    cpuUtilizationPct: values.cpu_util != null ? Math.round(values.cpu_util * 100) : undefined,
    memoryUtilizationPct: values.memory_util ?? undefined,
  };

  const kpis = computeDeltas(kpisBase, input.previousSnapshot);

  const signals: PrometheusOperationalSignal[] = [
    {
      id: "error-rate",
      category: "errors",
      label: "Error rate",
      value: `${kpis.errorRate}%`,
      severity: kpis.errorRate > 1 ? "critical" : kpis.errorRate > 0.5 ? "warning" : "info",
    },
    {
      id: "p95-latency",
      category: "latency",
      label: "P95 latency",
      value: `${kpis.p95LatencyMs}ms`,
      severity: kpis.p95LatencyMs > 500 ? "critical" : kpis.p95LatencyMs > 200 ? "warning" : "info",
    },
  ];

  if (upTargets != null) {
    signals.push({
      id: "up-targets",
      category: "resources",
      label: "Healthy targets",
      value: String(Math.round(upTargets)),
      severity: upTargets === 0 ? "critical" : "info",
    });
  }

  const healthMix = {
    healthy: healthScore >= 80 ? 1 : 0,
    degraded: healthScore >= 60 && healthScore < 80 ? 1 : 0,
    critical: healthScore < 60 ? 1 : 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    serviceScopes: input.serviceScopes,
    prometheusUrl: input.prometheusUrlLabel,
    provenance: input.provenance,
    kpis,
    healthMix,
    trend: input.previousSnapshot?.trend ?? [],
    byService: input.previousSnapshot?.byService ?? [],
    alerts: input.previousSnapshot?.alerts ?? [],
    deploys: input.previousSnapshot?.deploys ?? [],
    slos: input.previousSnapshot?.slos ?? [],
    signals,
    gaps,
  };
}

export function formatMetricsSyncSummary(input: {
  provenance: MetricsProvenance;
  snapshot: ObservabilityAnalysisSnapshot;
}): string {
  const dsLabel = input.provenance.datasourceName ?? "Prometheus";
  const via =
    input.provenance.path === "grafana-datasource-proxy"
      ? `metrics via Grafana→${dsLabel}`
      : "Prometheus metrics";
  return `${via}: health ${input.snapshot.kpis.healthScore}/100, P95 ${input.snapshot.kpis.p95LatencyMs}ms, error ${input.snapshot.kpis.errorRate}%`;
}
