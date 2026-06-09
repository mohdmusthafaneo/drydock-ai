import {
  queryPrometheusViaGrafana,
  type GrafanaAuth,
} from "@/lib/grafana-api";
import type { MetricsQueryTransport } from "@/lib/observability-metrics/types";

export function createGrafanaPrometheusProxyTransport(input: {
  grafanaUrl: string;
  auth: GrafanaAuth;
  datasourceUid: string;
}): MetricsQueryTransport {
  return {
    kind: "grafana-datasource-proxy",
    queryInstant: async (promql) => {
      const { result } = await queryPrometheusViaGrafana({
        grafanaUrl: input.grafanaUrl,
        auth: input.auth,
        datasourceUid: input.datasourceUid,
        promql,
        instant: true,
      });
      return result;
    },
    queryRange: async (promql, start, end, stepSec) => {
      const rangePromql = promql;
      void start;
      void end;
      void stepSec;
      const { result } = await queryPrometheusViaGrafana({
        grafanaUrl: input.grafanaUrl,
        auth: input.auth,
        datasourceUid: input.datasourceUid,
        promql: rangePromql,
        instant: false,
      });
      return result;
    },
  };
}
