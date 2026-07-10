import type { Integration } from "@/generated/prisma/client";
import { readJsonField } from "@/lib/json-field";
import type { PrometheusServiceScope } from "@/lib/observability-analysis/types";
import type { MetricsProvenance } from "@/lib/observability-metrics/types";

export type PrometheusAuthType = "bearer" | "basic" | "none";

export type PrometheusIntegrationMeta = {
  mode?: string;
  connectionMode?: "direct";
  metricsProvenance?: MetricsProvenance;
  prometheusUrl?: string;
  authType?: PrometheusAuthType;
  apiTokenEnc?: string;
  basicUsername?: string;
  basicPasswordEnc?: string;
  serviceScopes?: PrometheusServiceScope[];
  promqlOverrides?: Record<string, string>;
  alertmanagerWebhookSecret?: string;
  operationalSnapshot?: unknown;
  lastSyncSummary?: string;
  lastConnectionCheckAt?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  connectedBy?: string;
};

export function parsePrometheusMeta(metadataJson: unknown): PrometheusIntegrationMeta {
  return readJsonField<PrometheusIntegrationMeta>(metadataJson, {});
}

export function mergePrometheusMeta(
  existing: Partial<PrometheusIntegrationMeta>,
  patch: Partial<PrometheusIntegrationMeta>,
): string {
  return JSON.stringify({ ...existing, ...patch });
}

export function isPrometheusTrulyConnected(
  integration: { status: string; metadataJson: unknown } | undefined,
): boolean {
  if (!integration || integration.status !== "CONNECTED") return false;
  const meta = parsePrometheusMeta(integration.metadataJson);
  return meta.mode === "prometheus-readonly" && Boolean(meta.prometheusUrl);
}

export function buildPrometheusConnectMeta(input: {
  existing?: Partial<PrometheusIntegrationMeta>;
  prometheusUrl: string;
  authType: PrometheusAuthType;
  apiTokenEnc?: string;
  basicUsername?: string;
  basicPasswordEnc?: string;
  userId: string;
  connectionStatus: "ok" | "error";
  lastError?: string;
}): PrometheusIntegrationMeta {
  return {
    ...input.existing,
    mode: "prometheus-readonly",
    prometheusUrl: input.prometheusUrl,
    authType: input.authType,
    apiTokenEnc: input.apiTokenEnc ?? input.existing?.apiTokenEnc,
    basicUsername: input.basicUsername ?? input.existing?.basicUsername,
    basicPasswordEnc: input.basicPasswordEnc ?? input.existing?.basicPasswordEnc,
    connectedBy: input.userId,
    connectionStatus: input.connectionStatus,
    lastConnectionCheckAt: new Date().toISOString(),
    lastError: input.lastError,
    serviceScopes: input.existing?.serviceScopes,
    promqlOverrides: input.existing?.promqlOverrides,
    alertmanagerWebhookSecret: input.existing?.alertmanagerWebhookSecret,
    operationalSnapshot: input.existing?.operationalSnapshot,
    lastSyncSummary: input.existing?.lastSyncSummary,
  };
}
