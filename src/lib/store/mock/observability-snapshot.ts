import type {
  ObservabilityAnalysisFilters,
  ObservabilityAnalysisSnapshot,
  PrometheusServiceScope,
} from "@/lib/observability-analysis/types";

const MOCK_SCOPES: PrometheusServiceScope[] = [
  { id: "api-gateway", label: "api-gateway", type: "service", environment: "production" },
  { id: "web-client", label: "web-client", type: "service", environment: "production" },
  { id: "worker-jobs", label: "worker-jobs", type: "service", environment: "staging" },
  { id: "auth-service", label: "auth-service", type: "service", environment: "production" },
];

const BASE_SNAPSHOT: ObservabilityAnalysisSnapshot = {
  generatedAt: new Date().toISOString(),
  serviceScopes: MOCK_SCOPES,
  prometheusUrl: "https://prometheus.connexus.com",
  kpis: {
    healthScore: 84,
    healthScoreDelta: 3,
    errorRate: 0.32,
    errorRateDelta: -0.1,
    p95LatencyMs: 142,
    p95LatencyDelta: 12,
    openAlerts: 2,
    openAlertsDelta: 1,
    cpuUtilizationPct: 62,
    memoryUtilizationPct: 71,
    errorBudgetRemainingPct: 78,
  },
  healthMix: { healthy: 2, degraded: 1, critical: 1 },
  trend: [
    { syncedAt: "2026-05-20T10:00:00Z", healthScore: 79, errorRate: 0.45, p95LatencyMs: 128 },
    { syncedAt: "2026-05-27T10:00:00Z", healthScore: 81, errorRate: 0.38, p95LatencyMs: 135 },
    { syncedAt: "2026-06-03T10:00:00Z", healthScore: 84, errorRate: 0.32, p95LatencyMs: 142 },
  ],
  byService: [
    {
      id: "api-gateway",
      label: "api-gateway",
      environment: "production",
      healthScore: 91,
      errorRate: 0.12,
      p95LatencyMs: 98,
      cpuUtilizationPct: 54,
      memoryUtilizationPct: 62,
      openAlerts: 0,
    },
    {
      id: "web-client",
      label: "web-client",
      environment: "production",
      healthScore: 88,
      errorRate: 0.18,
      p95LatencyMs: 112,
      cpuUtilizationPct: 48,
      memoryUtilizationPct: 55,
      openAlerts: 0,
    },
    {
      id: "worker-jobs",
      label: "worker-jobs",
      environment: "staging",
      healthScore: 72,
      errorRate: 0.55,
      p95LatencyMs: 210,
      cpuUtilizationPct: 78,
      memoryUtilizationPct: 82,
      openAlerts: 1,
    },
    {
      id: "auth-service",
      label: "auth-service",
      environment: "production",
      healthScore: 58,
      errorRate: 1.24,
      p95LatencyMs: 285,
      cpuUtilizationPct: 88,
      memoryUtilizationPct: 91,
      openAlerts: 1,
    },
  ],
  alerts: [
    {
      alertname: "HighErrorRate",
      severity: "warning",
      service: "auth-service",
      state: "firing",
      startsAt: "2026-06-04T08:15:00Z",
    },
    {
      alertname: "MemoryPressure",
      severity: "warning",
      service: "worker-jobs",
      state: "firing",
      startsAt: "2026-06-03T22:40:00Z",
    },
    {
      alertname: "LatencySLOBurn",
      severity: "critical",
      service: "auth-service",
      state: "firing",
      startsAt: "2026-06-04T06:00:00Z",
    },
    {
      alertname: "PodCrashLooping",
      severity: "critical",
      service: "auth-service",
      state: "resolved",
      startsAt: "2026-06-02T14:00:00Z",
    },
  ],
  deploys: [
    {
      deploymentEventId: "dep-1",
      releaseName: "v2.4.1 — Auth hardening",
      environment: "production",
      deployedAt: "2026-06-03T16:30:00Z",
      health: "DEGRADED",
      healthScore: 58,
      errorRateDelta: 0.82,
      p95LatencyDelta: 95,
      rollbackRecommended: true,
    },
    {
      deploymentEventId: "dep-2",
      releaseName: "v2.4.0 — Gateway cache",
      environment: "production",
      deployedAt: "2026-05-28T11:00:00Z",
      health: "HEALTHY",
      healthScore: 91,
      errorRateDelta: -0.05,
      p95LatencyDelta: -8,
      rollbackRecommended: false,
    },
  ],
  slos: [
    {
      name: "api-availability",
      targetPct: 99.9,
      currentPct: 99.87,
      budgetRemainingPct: 78,
      burnRate1h: 1.2,
    },
    {
      name: "api-latency-p95",
      targetPct: 99.0,
      currentPct: 97.5,
      budgetRemainingPct: 42,
      burnRate1h: 2.8,
    },
  ],
  signals: [
    {
      id: "sig-1",
      category: "errors",
      label: "Elevated error rate",
      value: "auth-service at 1.24% — above 1.0% threshold",
      severity: "critical",
    },
    {
      id: "sig-2",
      category: "resources",
      label: "Resource saturation",
      value: "auth-service memory at 91% of limit",
      severity: "warning",
    },
    {
      id: "sig-3",
      category: "latency",
      label: "Latency regression",
      value: "worker-jobs P95 at 210ms — 1.4× staging baseline",
      severity: "warning",
    },
    {
      id: "sig-4",
      category: "deploy",
      label: "Post-deploy regression",
      value: "v2.4.1 deploy correlated with +0.82% error rate on auth-service",
      severity: "critical",
    },
    {
      id: "sig-5",
      category: "alerts",
      label: "Alert pressure",
      value: "2 firing alerts across production services",
      severity: "warning",
    },
  ],
  gaps: [
    {
      area: "SLO coverage",
      gap: "worker-jobs has no latency SLO template configured",
      priority: "medium",
    },
    {
      area: "Error budget",
      gap: "api-latency-p95 budget below 50% — review before next release gate",
      priority: "high",
    },
  ],
};

export function getAvailableMockServiceScopes(): PrometheusServiceScope[] {
  return MOCK_SCOPES;
}

function filterByRiskFocus(
  snapshot: ObservabilityAnalysisSnapshot,
  riskFocus: ObservabilityAnalysisFilters["riskFocus"],
): ObservabilityAnalysisSnapshot {
  if (riskFocus === "all") return snapshot;

  const categoryMap: Record<
    Exclude<ObservabilityAnalysisFilters["riskFocus"], "all">,
    ObservabilityAnalysisSnapshot["signals"][number]["category"]
  > = {
    errors: "errors",
    latency: "latency",
    resources: "resources",
    alerts: "alerts",
    deploy: "deploy",
  };

  const category = categoryMap[riskFocus];
  const signals = snapshot.signals.filter((s) => s.category === category);

  return {
    ...snapshot,
    signals,
  };
}

export function getMockObservabilityAnalysisSnapshot(
  filters: ObservabilityAnalysisFilters,
): ObservabilityAnalysisSnapshot {
  let byService = [...BASE_SNAPSHOT.byService];

  if (filters.serviceId) {
    byService = byService.filter((s) => s.id === filters.serviceId);
  }

  if (filters.environment !== "all") {
    byService = byService.filter((s) => s.environment === filters.environment);
  }

  const healthy = byService.filter((s) => s.healthScore >= 80).length;
  const degraded = byService.filter((s) => s.healthScore >= 60 && s.healthScore < 80).length;
  const critical = byService.filter((s) => s.healthScore < 60).length;

  const avg = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const kpis = {
    ...BASE_SNAPSHOT.kpis,
    healthScore: Math.round(avg(byService.map((s) => s.healthScore))),
    errorRate: Number(avg(byService.map((s) => s.errorRate)).toFixed(2)),
    p95LatencyMs: Math.round(avg(byService.map((s) => s.p95LatencyMs))),
    openAlerts: byService.reduce((n, s) => n + s.openAlerts, 0),
    cpuUtilizationPct: Math.round(avg(byService.map((s) => s.cpuUtilizationPct))),
    memoryUtilizationPct: Math.round(avg(byService.map((s) => s.memoryUtilizationPct))),
  };

  const alerts = BASE_SNAPSHOT.alerts.filter((a) => {
    if (filters.serviceId && a.service !== filters.serviceId) return false;
    if (filters.environment !== "all") {
      const svc = BASE_SNAPSHOT.byService.find((s) => s.label === a.service);
      if (svc && svc.environment !== filters.environment) return false;
    }
    return true;
  });

  const deploys = BASE_SNAPSHOT.deploys.filter((d) => {
    if (filters.environment !== "all" && d.environment !== filters.environment) return false;
    return true;
  });

  let snapshot: ObservabilityAnalysisSnapshot = {
    ...BASE_SNAPSHOT,
    generatedAt: new Date().toISOString(),
    kpis,
    healthMix: { healthy, degraded, critical },
    byService,
    alerts,
    deploys,
    signals: BASE_SNAPSHOT.signals.filter((s) => {
      if (filters.serviceId) {
        return s.value.toLowerCase().includes(filters.serviceId);
      }
      return true;
    }),
  };

  snapshot = filterByRiskFocus(snapshot, filters.riskFocus);
  return snapshot;
}
