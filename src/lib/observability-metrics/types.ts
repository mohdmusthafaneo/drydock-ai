import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";

export type MetricsProvenance = {
  path: "prometheus-direct" | "grafana-datasource-proxy";
  grafanaUrl?: string;
  prometheusUrl?: string;
  datasourceUid?: string;
  datasourceName?: string;
};

export type PrometheusQueryVectorResult = {
  metric: Record<string, string>;
  value: [number, string];
};

export type PrometheusQueryMatrixResult = {
  metric: Record<string, string>;
  values: Array<[number, string]>;
};

export type PrometheusQueryResult = {
  resultType: "vector" | "matrix" | "scalar" | "string";
  result: PrometheusQueryVectorResult[] | PrometheusQueryMatrixResult[];
  scalarValue?: number;
};

export type MetricsQueryTransport = {
  kind: "prometheus-direct" | "grafana-datasource-proxy";
  queryInstant(promql: string): Promise<PrometheusQueryResult>;
  queryRange(
    promql: string,
    start: Date,
    end: Date,
    stepSec: number,
  ): Promise<PrometheusQueryResult>;
};

export type MetricsAssessContext = {
  provenance: MetricsProvenance | null;
  synced: boolean;
  snapshot: ObservabilityAnalysisSnapshot | null;
};
