import type { Integration } from "@/generated/prisma/client";
import type { GitHubAssessContext } from "@/lib/github-assess-context";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { parseJiraMeta } from "@/lib/jira-meta";
import { parseGrafanaMeta } from "@/lib/grafana-meta";
import { parsePrometheusMeta } from "@/lib/prometheus-meta";
import type { CollectedTelemetry } from "@/lib/operational-intelligence";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import type { MetricsAssessContext } from "@/lib/observability-metrics/types";
import type { GovernanceAssessment } from "@/lib/release-governance";

export const STALE_ASSESS_HOURS = 24;
export const ERROR_RATE_DEGRADATION_THRESHOLD = 0.4;

export type AssessmentSnapshot = {
  assessedAt: string;
  readinessScore: number;
  governanceRiskScore: number;
  riskLevel: string;
  primaryRecommendation: string;
  kpis: {
    errorRate: number | null;
    errorRateDelta: string | null;
    p95LatencyMs: number | null;
    openAlerts: number;
    openIncidents: number;
    ciPassRatePct: number | null;
    metricsHealthScore: number | null;
  };
  metricsProvenance?: import("@/lib/observability-metrics/types").MetricsProvenance | null;
};

export type PostDeployComparison = {
  comparedAt: string;
  correlationId: string;
  baseline: {
    errorRate: number | null;
    openAlerts: number;
    openIncidents: number;
    p95LatencyMs: number | null;
  };
  current: {
    errorRate: number;
    openAlerts: number;
    openIncidents: number;
    p95LatencyMs: number;
  };
  errorRateDeltaPct: number | null;
  openAlertsDelta: number;
  openIncidentsDelta: number;
  p95LatencyDeltaMs: number | null;
  degraded: boolean;
  summary: string;
  rollbackRecommended: boolean;
};

export function buildAssessmentSnapshot(input: {
  assessment: GovernanceAssessment;
  metrics?: MetricsAssessContext;
  github?: GitHubAssessContext;
}): AssessmentSnapshot {
  const metricsKpis = input.metrics?.snapshot?.kpis;
  const assessedAt =
    input.assessment.telemetry.assessedAt ?? new Date().toISOString();

  return {
    assessedAt,
    readinessScore: input.assessment.qa.readinessScore,
    governanceRiskScore: input.assessment.governanceRiskScore,
    riskLevel: input.assessment.riskLevel,
    primaryRecommendation: input.assessment.primaryRecommendation,
    kpis: {
      errorRate: metricsKpis?.errorRate ?? null,
      errorRateDelta: input.assessment.telemetry.errorRateDelta ?? null,
      p95LatencyMs: metricsKpis?.p95LatencyMs ?? null,
      openAlerts: metricsKpis?.openAlerts ?? input.assessment.telemetry.openIncidents,
      openIncidents: input.assessment.telemetry.openIncidents,
      ciPassRatePct: input.github?.ci?.passRatePct ?? null,
      metricsHealthScore: metricsKpis?.healthScore ?? null,
    },
    metricsProvenance: input.assessment.telemetry.metricsProvenance ?? null,
  };
}

export function parseAssessmentSnapshot(raw: string | null | undefined): AssessmentSnapshot | null {
  if (!raw?.trim() || raw === "{}") return null;
  try {
    return JSON.parse(raw) as AssessmentSnapshot;
  } catch {
    return null;
  }
}

export function parsePostDeployComparison(
  raw: string | null | undefined,
): PostDeployComparison | null {
  if (!raw?.trim() || raw === "{}") return null;
  try {
    return JSON.parse(raw) as PostDeployComparison;
  } catch {
    return null;
  }
}

function metricValue(collected: CollectedTelemetry, key: string): number {
  return collected.metrics.find((m) => m.metricKey === key)?.value ?? 0;
}

export function comparePostDeploy(input: {
  baseline: AssessmentSnapshot;
  collected: CollectedTelemetry;
  rollbackRecommended?: boolean;
}): PostDeployComparison {
  const currentErrorRate = metricValue(input.collected, "http_error_rate");
  const currentP95 = metricValue(input.collected, "p95_latency_ms");
  const currentOpenAlerts = metricValue(input.collected, "active_incidents");
  const baselineErrorRate = input.baseline.kpis.errorRate;
  const baselineP95 = input.baseline.kpis.p95LatencyMs;
  const baselineOpenAlerts = input.baseline.kpis.openAlerts;
  const baselineOpenIncidents = input.baseline.kpis.openIncidents;

  const errorRateDeltaPct =
    baselineErrorRate != null ? currentErrorRate - baselineErrorRate : null;
  const openAlertsDelta = currentOpenAlerts - baselineOpenAlerts;
  const openIncidentsDelta = currentOpenAlerts - baselineOpenIncidents;
  const p95LatencyDeltaMs =
    baselineP95 != null ? currentP95 - baselineP95 : null;

  const degraded =
    input.collected.degradationDetected ||
    (errorRateDeltaPct != null && errorRateDeltaPct >= ERROR_RATE_DEGRADATION_THRESHOLD) ||
    openAlertsDelta > 0 ||
    (p95LatencyDeltaMs != null && p95LatencyDeltaMs > 25);

  const rollbackRecommended =
    input.rollbackRecommended ??
    (degraded &&
      (errorRateDeltaPct != null
        ? errorRateDeltaPct >= ERROR_RATE_DEGRADATION_THRESHOLD
        : currentErrorRate > 1.2));

  const parts: string[] = [];
  if (errorRateDeltaPct != null) {
    const sign = errorRateDeltaPct >= 0 ? "+" : "";
    parts.push(`${sign}${errorRateDeltaPct.toFixed(2)}% error rate vs assess baseline`);
  }
  if (openAlertsDelta !== 0) {
    const sign = openAlertsDelta >= 0 ? "+" : "";
    parts.push(`${sign}${openAlertsDelta} open alert(s) vs assess baseline`);
  }
  if (p95LatencyDeltaMs != null && Math.abs(p95LatencyDeltaMs) >= 5) {
    const sign = p95LatencyDeltaMs >= 0 ? "+" : "";
    parts.push(`${sign}${Math.round(p95LatencyDeltaMs)}ms P95 vs assess baseline`);
  }

  const summary =
    parts.length > 0
      ? `Post-deploy: ${parts.join("; ")}.`
      : degraded
        ? "Post-deploy signals show degradation vs assess baseline."
        : "Post-deploy signals within assess baseline.";

  return {
    comparedAt: new Date().toISOString(),
    correlationId: input.collected.correlationId,
    baseline: {
      errorRate: baselineErrorRate,
      openAlerts: baselineOpenAlerts,
      openIncidents: baselineOpenIncidents,
      p95LatencyMs: baselineP95,
    },
    current: {
      errorRate: currentErrorRate,
      openAlerts: currentOpenAlerts,
      openIncidents: currentOpenAlerts,
      p95LatencyMs: currentP95,
    },
    errorRateDeltaPct,
    openAlertsDelta,
    openIncidentsDelta,
    p95LatencyDeltaMs,
    degraded,
    summary,
    rollbackRecommended,
  };
}

export type SourceFreshness = {
  id: "jira" | "github" | "grafana" | "prometheus";
  label: string;
  connected: boolean;
  synced: boolean;
  lastSyncedAt: string | null;
};

export function resolveAssessSourceFreshness(integrations: Integration[]): SourceFreshness[] {
  const jira = integrations.find((i) => i.provider === "JIRA");
  const github = integrations.find((i) => i.provider === "GITHUB");
  const grafana = integrations.find((i) => i.provider === "GRAFANA");
  const prometheus = integrations.find((i) => i.provider === "PROMETHEUS");

  const jiraMeta = jira ? parseJiraMeta(jira.metadataJson) : null;
  const githubMeta = github ? parseIntegrationMeta(github.metadataJson) : null;
  const grafanaMeta = grafana ? parseGrafanaMeta(grafana.metadataJson) : null;
  const prometheusMeta = prometheus ? parsePrometheusMeta(prometheus.metadataJson) : null;
  const prometheusSnapshot = prometheusMeta?.operationalSnapshot as
    | ObservabilityAnalysisSnapshot
    | undefined;

  return [
    {
      id: "jira",
      label: "Jira",
      connected: jira?.status === "CONNECTED",
      synced: Boolean(jiraMeta?.deliverySnapshot?.syncedAt),
      lastSyncedAt:
        jiraMeta?.deliverySnapshot?.syncedAt ??
        jira?.lastSyncAt?.toISOString() ??
        null,
    },
    {
      id: "github",
      label: "GitHub",
      connected: github?.status === "CONNECTED",
      synced: Boolean(
        githubMeta?.repos?.length ||
          githubMeta?.codeAnalysisSnapshot?.syncedAt ||
          github?.lastSyncAt,
      ),
      lastSyncedAt:
        githubMeta?.codeAnalysisSnapshot?.syncedAt ??
        github?.lastSyncAt?.toISOString() ??
        null,
    },
    {
      id: "grafana",
      label: "Grafana",
      connected: grafana?.status === "CONNECTED",
      synced: Boolean(
        grafanaMeta?.operationalSnapshot?.generatedAt ||
          grafanaMeta?.metricsSnapshot?.generatedAt,
      ),
      lastSyncedAt:
        grafanaMeta?.metricsSnapshot?.generatedAt ??
        grafanaMeta?.operationalSnapshot?.generatedAt ??
        grafana?.lastSyncAt?.toISOString() ??
        null,
    },
    {
      id: "prometheus",
      label: "Prometheus",
      connected: prometheus?.status === "CONNECTED",
      synced: Boolean(prometheusSnapshot?.generatedAt),
      lastSyncedAt:
        prometheusSnapshot?.generatedAt ??
        prometheus?.lastSyncAt?.toISOString() ??
        null,
    },
  ];
}

export function isAssessDataStale(input: {
  assessedAt: Date | string | null;
  sourceFreshness: SourceFreshness[];
}): boolean {
  if (!input.assessedAt) return false;

  const assessedMs = new Date(input.assessedAt).getTime();
  const assessAgeHours = (Date.now() - assessedMs) / 3600000;
  if (assessAgeHours > STALE_ASSESS_HOURS) return true;

  const staleThresholdMs = STALE_ASSESS_HOURS * 3600000;
  for (const source of input.sourceFreshness) {
    if (!source.synced || !source.lastSyncedAt) continue;
    const syncMs = new Date(source.lastSyncedAt).getTime();
    if (assessedMs - syncMs > staleThresholdMs) return true;
  }

  return false;
}
