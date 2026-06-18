export type PrometheusOperationalSignal = {
  id: string;
  category: "errors" | "latency" | "resources" | "alerts" | "deploy";
  label: string;
  value: string;
  severity: "info" | "warning" | "critical";
};

export type PrometheusOperationalGap = {
  area: string;
  gap: string;
  priority: "low" | "medium" | "high";
};

export type PrometheusServiceScope = {
  id: string;
  label: string;
  type: "service";
  environment?: string;
};

export type ObservabilityAnalysisKpis = {
  healthScore: number;
  healthScoreDelta?: number;
  errorRate: number;
  errorRateDelta?: number;
  p95LatencyMs: number;
  p95LatencyDelta?: number;
  openAlerts: number;
  openAlertsDelta?: number;
  cpuUtilizationPct?: number;
  memoryUtilizationPct?: number;
  errorBudgetRemainingPct?: number | null;
};

export type ObservabilityAnalysisTrendPoint = {
  syncedAt: string;
  healthScore: number;
  errorRate: number;
  p95LatencyMs: number;
};

export type ObservabilityServiceRow = {
  id: string;
  label: string;
  environment: string;
  healthScore: number;
  errorRate: number;
  p95LatencyMs: number;
  cpuUtilizationPct: number;
  memoryUtilizationPct: number;
  openAlerts: number;
};

export type ObservabilityAlertRow = {
  alertname: string;
  severity: string;
  service: string;
  state: "firing" | "resolved";
  startsAt: string;
};

export type ObservabilityDeployRow = {
  deploymentEventId: string;
  releaseName: string;
  environment: string;
  deployedAt: string;
  health: string;
  healthScore: number;
  errorRateDelta: number;
  p95LatencyDelta: number;
  rollbackRecommended: boolean;
};

export type ObservabilitySloRow = {
  name: string;
  targetPct: number;
  currentPct: number;
  budgetRemainingPct: number;
  burnRate1h?: number;
};

export type ObservabilityAnalysisSnapshot = {
  generatedAt: string;
  serviceScopes: PrometheusServiceScope[];
  prometheusUrl: string;
  provenance?: import("@/lib/observability-metrics/types").MetricsProvenance;
  kpis: ObservabilityAnalysisKpis;
  healthMix: { healthy: number; degraded: number; critical: number };
  trend: ObservabilityAnalysisTrendPoint[];
  byService: ObservabilityServiceRow[];
  alerts: ObservabilityAlertRow[];
  deploys: ObservabilityDeployRow[];
  slos: ObservabilitySloRow[];
  signals: PrometheusOperationalSignal[];
  gaps: PrometheusOperationalGap[];
};

export type ObservabilityAnalysisFilters = {
  serviceId: string | null;
  environment: "all" | "production" | "staging" | "development";
  range: "7d" | "30d" | "90d";
  compare: "previous_sync";
  riskFocus: "all" | "errors" | "latency" | "resources" | "alerts" | "deploy";
};

export const HEALTH_MIX_COLORS = {
  healthy: "var(--color-chart-blue)",
  degraded: "color-mix(in srgb, var(--color-rust) 75%, white)",
  critical: "var(--color-rust)",
} as const;

export const HEALTH_MIX_LABELS = {
  healthy: "Healthy",
  degraded: "Degraded",
  critical: "Critical",
} as const;
