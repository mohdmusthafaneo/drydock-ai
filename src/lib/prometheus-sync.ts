import type { MetricSource } from "@/generated/prisma/client";
import { markIntegrationSync } from "@/lib/integration-health";
import { ingestNormalizedEvents } from "@/lib/telemetry-ingest";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import {
  formatMetricsSyncSummary,
  runPromqlSync,
} from "@/lib/observability-metrics/run-promql-sync";
import type { MetricsProvenance } from "@/lib/observability-metrics/types";
import {
  createDirectPrometheusTransport,
  getPrometheusAuth,
} from "@/lib/prometheus-api";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { mergePrometheusMeta, parsePrometheusMeta } from "@/lib/prometheus-meta";
import { prisma } from "@/lib/prisma";

const PROMETHEUS_SOURCE: MetricSource = "PROMETHEUS";

function buildTelemetryMetrics(
  organizationId: string,
  prometheusUrl: string,
  snapshot: ObservabilityAnalysisSnapshot,
) {
  const { kpis } = snapshot;
  const base = {
    organizationId,
    source: PROMETHEUS_SOURCE,
    labelsJson: JSON.stringify({ prometheusUrl, path: "prometheus-direct" }),
  };

  return [
    { ...base, metricKey: "health_score", value: kpis.healthScore, unit: "score" },
    { ...base, metricKey: "error_rate", value: kpis.errorRate, unit: "percent" },
    { ...base, metricKey: "p95_latency_ms", value: kpis.p95LatencyMs, unit: "ms" },
  ];
}

export async function syncPrometheusIntegration(input: {
  organizationId: string;
  userId: string;
}) {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "PROMETHEUS",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("Prometheus is not connected");
  }

  const meta = parsePrometheusMeta(integration.metadataJson);
  const prometheusUrl = meta.prometheusUrl;
  if (!prometheusUrl) throw new Error("Prometheus URL is missing");

  const auth = getPrometheusAuth(integration);
  if (!auth) throw new Error("Prometheus credentials are missing");

  const transport = createDirectPrometheusTransport({ prometheusUrl, auth });

  const provenance: MetricsProvenance = {
    path: "prometheus-direct",
    prometheusUrl,
  };

  const previousSnapshot =
    (meta.operationalSnapshot as ObservabilityAnalysisSnapshot | undefined) ?? null;

  const snapshot = await runPromqlSync({
    transport,
    serviceScopes: meta.serviceScopes ?? [],
    promqlOverrides: meta.promqlOverrides,
    previousSnapshot,
    provenance,
    prometheusUrlLabel: prometheusUrl,
  });

  const summary = formatMetricsSyncSummary({ provenance, snapshot });

  await ingestNormalizedEvents({
    organizationId: input.organizationId,
    userId: input.userId,
    events: [
      {
        eventType: "observability",
        source: "prometheus",
        severity: snapshot.kpis.healthScore < 60 ? "warning" : "info",
        payload: {
          action: "sync.completed",
          healthScore: snapshot.kpis.healthScore,
          errorRate: snapshot.kpis.errorRate,
          p95LatencyMs: snapshot.kpis.p95LatencyMs,
        },
      },
    ],
  });

  const metrics = buildTelemetryMetrics(input.organizationId, prometheusUrl, snapshot);

  const metadataJson = mergePrometheusMeta(meta, {
    operationalSnapshot: snapshot,
    metricsProvenance: provenance,
    lastSyncSummary: summary,
    lastError: undefined,
  });

  await prisma.$transaction(async (tx) => {
    await tx.telemetryMetric.createMany({ data: metrics });

    await tx.integration.update({
      where: { id: integration.id },
      data: {
        metadataJson,
        lastSyncAt: new Date(),
        lastError: null,
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "integration.synced",
        title: "Prometheus metrics snapshot synchronized",
        description: summary,
        metadataJson: JSON.stringify({
          provider: "PROMETHEUS",
          healthScore: snapshot.kpis.healthScore,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "prometheus.metrics_sync.completed",
        entityType: "Integration",
        entityId: integration.id,
        metadataJson: JSON.stringify({
          healthScore: snapshot.kpis.healthScore,
          errorRate: snapshot.kpis.errorRate,
          p95LatencyMs: snapshot.kpis.p95LatencyMs,
        }),
      },
    });
  });

  await markIntegrationSync(input.organizationId, "PROMETHEUS");

  invalidateExecutiveBriefingSnapshot(input.organizationId);

  return {
    summary,
    syncedAt: snapshot.generatedAt,
    healthScore: snapshot.kpis.healthScore,
    snapshot,
  };
}
