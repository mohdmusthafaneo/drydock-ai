import type { PrometheusServiceScope } from "@/lib/observability-analysis/types";

export type PrometheusIntegrationMeta = {
  mode?: string;
  prometheusUrl?: string;
  serviceScopes?: PrometheusServiceScope[];
  operationalSnapshot?: unknown;
  lastSyncSummary?: string;
};

export function parsePrometheusMeta(metadataJson: string): PrometheusIntegrationMeta {
  try {
    return JSON.parse(metadataJson) as PrometheusIntegrationMeta;
  } catch {
    return {};
  }
}

export function isPrometheusTrulyConnected(
  integration: { status: string; metadataJson: string } | undefined,
): boolean {
  if (!integration || integration.status !== "CONNECTED") return false;
  const meta = parsePrometheusMeta(integration.metadataJson);
  return meta.mode !== "observability-stub";
}
