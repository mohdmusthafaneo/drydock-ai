import type {
  GrafanaOperationalSnapshot,
  GrafanaDashboardScope,
} from "@/lib/grafana-meta";

export type GrafanaHealthInput = {
  openAlerts: number;
  firingCritical: number;
  dashboardCoveragePct: number;
  annotations24h: number;
  missingDatasourceCount: number;
  staleDashboardCount: number;
  scopedDashboardCount: number;
};

export function computeGrafanaHealthScore(input: GrafanaHealthInput): number {
  let score = 100;

  score -= Math.min(input.openAlerts * 5, 30);
  score -= Math.min(input.firingCritical * 10, 40);

  const coveragePenalty = Math.round((100 - input.dashboardCoveragePct) * 0.3);
  score -= coveragePenalty;

  score -= Math.min(input.missingDatasourceCount * 5, 20);
  score -= Math.min(input.staleDashboardCount * 3, 15);

  if (input.scopedDashboardCount === 0) {
    score = Math.min(score, 40);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildGrafanaGaps(input: {
  dashboardCoveragePct: number;
  missingDatasourceCount: number;
  staleDashboardCount: number;
  openAlerts: number;
  firingCritical: number;
  scopedDashboardCount: number;
}): GrafanaOperationalSnapshot["gaps"] {
  const gaps: GrafanaOperationalSnapshot["gaps"] = [];

  if (input.scopedDashboardCount === 0) {
    gaps.push({
      area: "Scope",
      gap: "No dashboards or folders selected for sync",
      priority: "high",
    });
  }

  if (input.dashboardCoveragePct < 50) {
    gaps.push({
      area: "Dashboard coverage",
      gap: `Only ${input.dashboardCoveragePct}% of scoped dashboards show recent data`,
      priority: input.dashboardCoveragePct < 25 ? "high" : "medium",
    });
  }

  if (input.missingDatasourceCount > 0) {
    gaps.push({
      area: "Datasources",
      gap: `${input.missingDatasourceCount} dashboard(s) have panels without datasource bindings`,
      priority: "medium",
    });
  }

  if (input.staleDashboardCount > 0) {
    gaps.push({
      area: "Freshness",
      gap: `${input.staleDashboardCount} dashboard(s) appear stale or empty`,
      priority: "low",
    });
  }

  if (input.firingCritical > 0) {
    gaps.push({
      area: "Alerts",
      gap: `${input.firingCritical} critical alert(s) firing`,
      priority: "high",
    });
  } else if (input.openAlerts > 0) {
    gaps.push({
      area: "Alerts",
      gap: `${input.openAlerts} alert(s) firing`,
      priority: "medium",
    });
  }

  return gaps;
}

export function buildGrafanaSignals(input: {
  openAlerts: number;
  firingCritical: number;
  dashboardCoveragePct: number;
  annotations24h: number;
  healthScore: number;
}): GrafanaOperationalSnapshot["signals"] {
  const signals: GrafanaOperationalSnapshot["signals"] = [
    {
      id: "health-score",
      label: "Observability health",
      value: `${input.healthScore}/100`,
      severity:
        input.healthScore >= 75 ? "info" : input.healthScore >= 50 ? "warning" : "critical",
    },
    {
      id: "open-alerts",
      label: "Firing alerts",
      value: String(input.openAlerts),
      severity:
        input.firingCritical > 0 ? "critical" : input.openAlerts > 0 ? "warning" : "info",
    },
    {
      id: "dashboard-coverage",
      label: "Dashboard coverage",
      value: `${input.dashboardCoveragePct}%`,
      severity:
        input.dashboardCoveragePct >= 75
          ? "info"
          : input.dashboardCoveragePct >= 50
            ? "warning"
            : "critical",
    },
    {
      id: "annotations-24h",
      label: "Annotations (24h)",
      value: String(input.annotations24h),
      severity: "info",
    },
  ];

  return signals;
}

export function buildGrafanaSnapshot(input: {
  grafanaUrl: string;
  dashboardScopes: GrafanaDashboardScope[];
  dashboards: GrafanaOperationalSnapshot["dashboards"];
  alerts: GrafanaOperationalSnapshot["alerts"];
  annotations24h: number;
  openAlerts: number;
  firingCritical: number;
}): GrafanaOperationalSnapshot {
  const scopedCount = input.dashboards.length;
  const withRecentData = input.dashboards.filter((d) => d.hasRecentData).length;
  const dashboardCoveragePct =
    scopedCount > 0 ? Math.round((withRecentData / scopedCount) * 100) : 0;
  const missingDatasourceCount = input.dashboards.filter((d) => d.missingDatasource).length;
  const staleDashboardCount = input.dashboards.filter((d) => !d.hasRecentData).length;

  const healthScore = computeGrafanaHealthScore({
    openAlerts: input.openAlerts,
    firingCritical: input.firingCritical,
    dashboardCoveragePct,
    annotations24h: input.annotations24h,
    missingDatasourceCount,
    staleDashboardCount,
    scopedDashboardCount: scopedCount,
  });

  return {
    generatedAt: new Date().toISOString(),
    grafanaUrl: input.grafanaUrl,
    dashboardScopes: input.dashboardScopes,
    kpis: {
      openAlerts: input.openAlerts,
      firingCritical: input.firingCritical,
      dashboardCoveragePct,
      annotations24h: input.annotations24h,
      healthScore,
    },
    alerts: input.alerts,
    dashboards: input.dashboards,
    gaps: buildGrafanaGaps({
      dashboardCoveragePct,
      missingDatasourceCount,
      staleDashboardCount,
      openAlerts: input.openAlerts,
      firingCritical: input.firingCritical,
      scopedDashboardCount: scopedCount,
    }),
    signals: buildGrafanaSignals({
      openAlerts: input.openAlerts,
      firingCritical: input.firingCritical,
      dashboardCoveragePct,
      annotations24h: input.annotations24h,
      healthScore,
    }),
  };
}
