import type { Integration } from "@/generated/prisma/client";
import type { PrometheusServiceScope } from "@/lib/observability-analysis/types";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import type { MetricsProvenance } from "@/lib/observability-metrics/types";

export type GrafanaAuthType = "bearer" | "none";

export type GrafanaDashboardScope = {
  uid: string;
  title: string;
  folderTitle?: string;
  type: "dashboard" | "folder";
  tags?: string[];
};

export type GrafanaPrometheusDatasource = {
  uid: string;
  name: string;
  type: "prometheus";
  isDefault?: boolean;
  lastProbedAt?: string;
  lastProbeStatus?: "ok" | "error";
  lastProbeSummary?: string;
};

export type GrafanaOperationalSnapshot = {
  generatedAt: string;
  grafanaUrl: string;
  dashboardScopes: GrafanaDashboardScope[];
  kpis: {
    openAlerts: number;
    firingCritical: number;
    dashboardCoveragePct: number;
    annotations24h: number;
    healthScore: number;
  };
  alerts: Array<{
    fingerprint: string;
    alertname: string;
    severity: string;
    state: "firing" | "resolved";
    service?: string;
    startsAt: string;
    dashboardUid?: string;
  }>;
  dashboards: Array<{
    uid: string;
    title: string;
    hasRecentData: boolean;
    panelCount: number;
    missingDatasource?: boolean;
  }>;
  gaps: Array<{ area: string; gap: string; priority: "low" | "medium" | "high" }>;
  signals: Array<{
    id: string;
    label: string;
    value: string;
    severity: "info" | "warning" | "critical";
  }>;
};

export type GrafanaIntegrationMeta = {
  mode?: string;
  grafanaUrl?: string;
  authType?: GrafanaAuthType;
  apiTokenEnc?: string;
  dashboardScopes?: GrafanaDashboardScope[];
  tagFilter?: string[];
  alertLabelSelectors?: Record<string, string>;
  webhookSecret?: string;
  operationalSnapshot?: GrafanaOperationalSnapshot;
  prometheusDatasource?: GrafanaPrometheusDatasource | null;
  metricsServiceScopes?: PrometheusServiceScope[];
  promqlOverrides?: Record<string, string>;
  metricsSnapshot?: ObservabilityAnalysisSnapshot;
  metricsProvenance?: MetricsProvenance;
  metricsLastSyncSummary?: string;
  metricsLastError?: string;
  lastSyncSummary?: string;
  lastConnectionCheckAt?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  connectedBy?: string;
};

export function parseGrafanaMeta(metadataJson: string): GrafanaIntegrationMeta {
  try {
    return JSON.parse(metadataJson) as GrafanaIntegrationMeta;
  } catch {
    return {};
  }
}

export function mergeGrafanaMeta(
  existing: Partial<GrafanaIntegrationMeta>,
  patch: Partial<GrafanaIntegrationMeta>,
): string {
  return JSON.stringify({ ...existing, ...patch });
}

export function isGrafanaTrulyConnected(
  integration: { status: string; metadataJson: string } | undefined,
): boolean {
  if (!integration || integration.status !== "CONNECTED") return false;
  const meta = parseGrafanaMeta(integration.metadataJson);
  return meta.mode === "grafana-readonly" && Boolean(meta.grafanaUrl);
}

export function buildGrafanaConnectMeta(input: {
  existing?: Partial<GrafanaIntegrationMeta>;
  grafanaUrl: string;
  authType: GrafanaAuthType;
  apiTokenEnc?: string;
  userId: string;
  connectionStatus: "ok" | "error";
  lastError?: string;
}): GrafanaIntegrationMeta {
  return {
    ...input.existing,
    mode: "grafana-readonly",
    grafanaUrl: input.grafanaUrl,
    authType: input.authType,
    apiTokenEnc: input.apiTokenEnc ?? input.existing?.apiTokenEnc,
    connectedBy: input.userId,
    connectionStatus: input.connectionStatus,
    lastConnectionCheckAt: new Date().toISOString(),
    lastError: input.lastError,
    dashboardScopes: input.existing?.dashboardScopes,
    tagFilter: input.existing?.tagFilter,
    alertLabelSelectors: input.existing?.alertLabelSelectors,
    webhookSecret: input.existing?.webhookSecret,
    operationalSnapshot: input.existing?.operationalSnapshot,
    prometheusDatasource: input.existing?.prometheusDatasource,
    metricsServiceScopes: input.existing?.metricsServiceScopes,
    promqlOverrides: input.existing?.promqlOverrides,
    metricsSnapshot: input.existing?.metricsSnapshot,
    metricsProvenance: input.existing?.metricsProvenance,
    metricsLastSyncSummary: input.existing?.metricsLastSyncSummary,
    metricsLastError: input.existing?.metricsLastError,
    lastSyncSummary: input.existing?.lastSyncSummary,
  };
}

export function getGrafanaAuthFromIntegration(integration: Integration): {
  authType: GrafanaAuthType;
  apiTokenEnc?: string;
} | null {
  const meta = parseGrafanaMeta(integration.metadataJson);
  if (!meta.authType) return null;
  return { authType: meta.authType, apiTokenEnc: meta.apiTokenEnc };
}
