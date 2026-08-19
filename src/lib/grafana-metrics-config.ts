import { prisma } from "@/lib/prisma";
import {
  getGrafanaAuth,
  getGrafanaDatasourceByUid,
  GrafanaApiError,
  listGrafanaPrometheusDatasources,
  probeGrafanaPrometheusDatasource,
} from "@/lib/grafana-api";
import {
  isGrafanaTrulyConnected,
  mergeGrafanaMeta,
  parseGrafanaMeta,
  type GrafanaPrometheusDatasource,
} from "@/lib/grafana-meta";
import type { PrometheusServiceScope } from "@/lib/observability-analysis/types";

import { determineActorType } from "@/lib/audit-helpers";
export const MAX_GRAFANA_METRICS_SCOPES = 10;

const PROBE_THROTTLE_MS = 60_000;
const PROBE_MAX_PER_WINDOW = 10;
const probeTimestamps = new Map<string, number[]>();

export function checkGrafanaMetricsProbeRateLimit(organizationId: string): boolean {
  const now = Date.now();
  const windowStart = now - PROBE_THROTTLE_MS;
  const timestamps = (probeTimestamps.get(organizationId) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= PROBE_MAX_PER_WINDOW) {
    return false;
  }
  timestamps.push(now);
  probeTimestamps.set(organizationId, timestamps);
  return true;
}

export async function fetchOrgGrafanaPrometheusDatasources(organizationId: string) {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "GRAFANA" },
    },
  });

  if (!integration || !isGrafanaTrulyConnected(integration)) {
    throw new GrafanaApiError("Grafana is not connected", 400);
  }

  const meta = parseGrafanaMeta(integration.metadataJson);
  const grafanaUrl = meta.grafanaUrl;
  if (!grafanaUrl) throw new GrafanaApiError("Grafana URL is missing", 400);

  const auth = getGrafanaAuth(integration);
  if (!auth) throw new GrafanaApiError("Grafana credentials are missing", 400);

  const datasources = await listGrafanaPrometheusDatasources(grafanaUrl, auth);

  return {
    datasources,
    selected: meta.prometheusDatasource ?? null,
  };
}

export async function runGrafanaMetricsProbe(input: {
  organizationId: string;
  datasourceUid: string;
}) {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId: input.organizationId, provider: "GRAFANA" },
    },
  });

  if (!integration || !isGrafanaTrulyConnected(integration)) {
    throw new GrafanaApiError("Grafana is not connected", 400);
  }

  const meta = parseGrafanaMeta(integration.metadataJson);
  const grafanaUrl = meta.grafanaUrl;
  if (!grafanaUrl) throw new GrafanaApiError("Grafana URL is missing", 400);

  const auth = getGrafanaAuth(integration);
  if (!auth) throw new GrafanaApiError("Grafana credentials are missing", 400);

  const ds = await getGrafanaDatasourceByUid(grafanaUrl, auth, input.datasourceUid);
  if (!ds || ds.type !== "prometheus") {
    throw new GrafanaApiError("Prometheus datasource not found — re-select on Integrations", 400);
  }

  const probe = await probeGrafanaPrometheusDatasource({
    grafanaUrl,
    auth,
    datasourceUid: input.datasourceUid,
  });

  return { probe, datasource: ds };
}

export async function saveOrgGrafanaMetricsConfig(input: {
  organizationId: string;
  userId: string;
  prometheusDatasource: GrafanaPrometheusDatasource;
  metricsServiceScopes?: PrometheusServiceScope[];
  promqlOverrides?: Record<string, string>;
}) {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId: input.organizationId, provider: "GRAFANA" },
    },
  });

  if (!integration || !isGrafanaTrulyConnected(integration)) {
    throw new GrafanaApiError("Grafana is not connected", 400);
  }

  const meta = parseGrafanaMeta(integration.metadataJson);
  const grafanaUrl = meta.grafanaUrl;
  if (!grafanaUrl) throw new GrafanaApiError("Grafana URL is missing", 400);

  const auth = getGrafanaAuth(integration);
  if (!auth) throw new GrafanaApiError("Grafana credentials are missing", 400);

  const ds = await getGrafanaDatasourceByUid(
    grafanaUrl,
    auth,
    input.prometheusDatasource.uid,
  );
  if (!ds || ds.type !== "prometheus") {
    throw new GrafanaApiError("Prometheus datasource not found — re-select on Integrations", 400);
  }

  const probe = await probeGrafanaPrometheusDatasource({
    grafanaUrl,
    auth,
    datasourceUid: ds.uid,
  });

  const prometheusDatasource: GrafanaPrometheusDatasource = {
    uid: ds.uid,
    name: ds.name,
    type: "prometheus",
    isDefault: ds.isDefault,
    lastProbedAt: new Date().toISOString(),
    lastProbeStatus: "ok",
    lastProbeSummary: probe.summary,
  };

  const scopes = input.metricsServiceScopes?.slice(0, MAX_GRAFANA_METRICS_SCOPES);

  const metadataJson = mergeGrafanaMeta(meta, {
    prometheusDatasource,
    metricsServiceScopes: scopes,
    promqlOverrides: input.promqlOverrides,
    metricsLastError: undefined,
  });

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: integration.id },
      data: { metadataJson },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "integration.configured",
        title: "Grafana metrics config saved",
        description: `Prometheus datasource ${ds.name} selected for proxy metrics`,
        metadataJson: JSON.stringify({
          provider: "GRAFANA",
          datasourceUid: ds.uid,
          datasourceName: ds.name,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "grafana.metrics_config.saved",
        entityType: "Integration",
        entityId: integration.id,
        metadataJson: JSON.stringify({
          datasourceUid: ds.uid,
          datasourceName: ds.name,
          probeSummary: probe.summary,
        }),
        actorType: determineActorType(input.userId, "grafana.metrics_config.saved"),
      },
    });
  });

  return {
    probe: { status: "ok" as const, summary: probe.summary },
    prometheusDatasource,
  };
}
