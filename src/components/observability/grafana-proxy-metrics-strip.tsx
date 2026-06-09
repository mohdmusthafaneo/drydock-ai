"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMetricsSourceLabel } from "@/lib/observability-metrics/format-source-label";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import type { MetricsProvenance } from "@/lib/observability-metrics/types";

export function GrafanaProxyMetricsStrip({
  snapshot,
  provenance,
  lastSyncedAt,
}: {
  snapshot: ObservabilityAnalysisSnapshot;
  provenance?: MetricsProvenance | null;
  lastSyncedAt?: string | null;
}) {
  const { kpis } = snapshot;
  const label = formatMetricsSourceLabel(provenance ?? snapshot.provenance);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
        <Badge variant="brand">Proxy metrics</Badge>
        <p className="text-sm text-secondary">{label}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted">Health score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">{kpis.healthScore}/100</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted">P95 latency</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">{kpis.p95LatencyMs}ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted">Error rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">{kpis.errorRate}%</p>
          </CardContent>
        </Card>
      </div>

      {snapshot.gaps.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning-muted/30 p-3">
          <p className="text-xs font-medium text-primary">Partial sync gaps</p>
          <ul className="mt-1 space-y-1 text-xs text-secondary">
            {snapshot.gaps.map((g, i) => (
              <li key={i}>{g.gap}</li>
            ))}
          </ul>
        </div>
      )}

      {lastSyncedAt && (
        <p className="text-xs text-muted">
          Last synced {new Date(lastSyncedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
