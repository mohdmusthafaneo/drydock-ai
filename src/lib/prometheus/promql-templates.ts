import type { PrometheusServiceScope } from "@/lib/observability-analysis/types";

export type PromqlTemplateId = "up" | "error_rate" | "p95_latency" | "cpu_util" | "memory_util";

export type PromqlTemplate = {
  id: PromqlTemplateId;
  kpiField: keyof Pick<
    import("@/lib/observability-analysis/types").ObservabilityAnalysisKpis,
    "errorRate" | "p95LatencyMs" | "cpuUtilizationPct" | "memoryUtilizationPct"
  > | "probe";
  defaultQuery: string;
  unit: "count" | "percent" | "ms" | "bytes";
};

export const PROMQL_TEMPLATES: PromqlTemplate[] = [
  {
    id: "up",
    kpiField: "probe",
    defaultQuery: "count(up == 1)",
    unit: "count",
  },
  {
    id: "error_rate",
    kpiField: "errorRate",
    defaultQuery:
      "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))",
    unit: "percent",
  },
  {
    id: "p95_latency",
    kpiField: "p95LatencyMs",
    defaultQuery:
      "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
    unit: "ms",
  },
  {
    id: "cpu_util",
    kpiField: "cpuUtilizationPct",
    defaultQuery: "avg(rate(process_cpu_seconds_total[5m]))",
    unit: "percent",
  },
  {
    id: "memory_util",
    kpiField: "memoryUtilizationPct",
    defaultQuery: "avg(process_resident_memory_bytes)",
    unit: "bytes",
  },
];

/** v1 sync ships these three templates */
export const V1_SYNC_TEMPLATE_IDS: PromqlTemplateId[] = ["up", "error_rate", "p95_latency"];

export const MAX_CONCURRENT_PROMQL_TEMPLATES = 8;

export function buildScopeLabelMatcher(scopes: PrometheusServiceScope[]): string {
  if (!scopes.length) return "";
  const labels = scopes.map((s) => s.label.replace(/"/g, '\\"')).join("|");
  return `{service=~"${labels}"}`;
}

export function injectScopeFilter(query: string, scopes: PrometheusServiceScope[]): string {
  if (!scopes.length) return query;

  const matcher = buildScopeLabelMatcher(scopes);
  const scopeLabels = matcher.slice(1, -1);

  if (query.includes("{")) {
    return query.replace(/\{([^}]*)\}/, (_, inner: string) => {
      const trimmed = inner.trim();
      if (!trimmed) return matcher;
      return `{${trimmed},${scopeLabels}}`;
    });
  }

  return query.replace(
    /\b(up|http_requests_total|http_request_duration_seconds_bucket|process_cpu_seconds_total|process_resident_memory_bytes)\b/g,
    `$1${matcher}`,
  );
}

export function resolveTemplateQuery(
  templateId: PromqlTemplateId,
  scopes: PrometheusServiceScope[],
  overrides?: Record<string, string>,
): string {
  const template = PROMQL_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);

  const base = overrides?.[templateId]?.trim() || template.defaultQuery;
  if (overrides?.[templateId]) {
    return base;
  }
  return injectScopeFilter(base, scopes);
}
