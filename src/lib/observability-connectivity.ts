import type { Integration } from "@/generated/prisma/client";
import { isGrafanaTrulyConnected } from "@/lib/grafana-meta";
import { isPrometheusTrulyConnected } from "@/lib/prometheus-meta";

export type LiveObservabilityStatus = {
  grafana: boolean;
  prometheus: boolean;
  any: boolean;
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

export { isGrafanaTrulyConnected } from "@/lib/grafana-meta";
export { isPrometheusTrulyConnected } from "@/lib/prometheus-meta";
