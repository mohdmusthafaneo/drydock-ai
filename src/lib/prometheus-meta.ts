import type { Integration } from "@/generated/prisma/client";
import type { PrometheusServiceScope } from "@/lib/observability-analysis/types";

export type PrometheusAuthType = "bearer" | "basic" | "none";

export type PrometheusIntegrationMeta = {
  mode?: string;
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

export function parsePrometheusMeta(metadataJson: string): PrometheusIntegrationMeta {
  try {
    return JSON.parse(metadataJson) as PrometheusIntegrationMeta;
  } catch {
    return {};
  }
}

export function mergePrometheusMeta(
  existing: Partial<PrometheusIntegrationMeta>,
  patch: Partial<PrometheusIntegrationMeta>,
): string {
  return JSON.stringify({ ...existing, ...patch });
}

export function isPrometheusTrulyConnected(
  integration: { status: string; metadataJson: string } | undefined,
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
