"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { GrafanaOperationalSnapshot } from "@/lib/grafana-meta";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  snapshot: GrafanaOperationalSnapshot;
  lastSyncedAt: string | null;
  canSync: boolean;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function severityBadgeVariant(severity: string) {
  const s = severity.toLowerCase();
  if (s === "critical") return "error" as const;
  if (s === "warning" || s === "warn") return "warning" as const;
  return "muted" as const;
}

export function GrafanaObservabilityDashboard({ snapshot, lastSyncedAt, canSync }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { kpis, alerts, dashboards, gaps, signals } = snapshot;
  const firingAlerts = alerts.filter((a) => a.state === "firing");

  async function handleSync() {
    if (!canSync) return;
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/integrations/grafana/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; summary?: string };
      if (!res.ok) {
        setSyncError(data.error ?? "Sync failed");
        return;
      }
      setSyncMessage(data.summary ?? "Grafana sync complete");
      window.location.reload();
    } catch {
      setSyncError("Sync request failed");
    } finally {
      setSyncing(false);
    }
  }

  const lastSyncedLabel = lastSyncedAt
    ? `Live data · last synced ${formatRelative(lastSyncedAt)}`
    : snapshot.generatedAt
      ? `Snapshot from ${formatRelative(snapshot.generatedAt)}`
      : "Not synced yet";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">
          Grafana alerts & dashboards · {snapshot.dashboardScopes.length} scoped target
          {snapshot.dashboardScopes.length === 1 ? "" : "s"} · {lastSyncedLabel}
        </p>
        {canSync && (
          <Button type="button" size="sm" variant="secondary" disabled={syncing} onClick={handleSync}>
            <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {syncing ? "Syncing…" : "Sync Grafana"}
          </Button>
        )}
      </div>

      {(syncMessage || syncError) && (
        <p className={cn("text-xs", syncError ? "text-warning-soft" : "text-success-soft")}>
          {syncError ?? syncMessage}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Health score" value={String(kpis.healthScore)} subtitle="Rule-based at sync" />
        <KpiCard
          label="Open alerts"
          value={String(kpis.openAlerts)}
          subtitle={`${kpis.firingCritical} critical`}
          highlight={kpis.openAlerts > 0}
        />
        <KpiCard
          label="Dashboard coverage"
          value={`${kpis.dashboardCoveragePct}%`}
          subtitle="Scoped dashboards with data"
        />
        <KpiCard
          label="Annotations (24h)"
          value={String(kpis.annotations24h)}
          subtitle="Deploy markers & notes"
        />
        <KpiCard
          label="Dashboards tracked"
          value={String(dashboards.length)}
          subtitle="From selected scopes"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Firing alerts</CardTitle>
          <CardDescription>
            Unified alerting state from Grafana at last sync
            {firingAlerts.length === 0 && " — no alerts firing"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {firingAlerts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No firing alerts in scoped sync.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="pb-2 pr-4 font-medium">Alert</th>
                    <th className="pb-2 pr-4 font-medium">Severity</th>
                    <th className="pb-2 pr-4 font-medium">Service</th>
                    <th className="pb-2 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {firingAlerts.map((alert) => (
                    <tr key={alert.fingerprint} className="border-b border-border-subtle">
                      <td className="py-2.5 pr-4 font-medium text-primary">{alert.alertname}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={severityBadgeVariant(alert.severity)}>
                          {alert.severity}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-secondary">{alert.service ?? "—"}</td>
                      <td className="py-2.5 text-muted">
                        {alert.startsAt ? new Date(alert.startsAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dashboard health</CardTitle>
          <CardDescription>
            Coverage and datasource health for scoped dashboards
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboards.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No dashboards in snapshot.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {dashboards.map((dash) => {
                const dashUrl = `${snapshot.grafanaUrl}/d/${dash.uid}`;
                return (
                  <li
                    key={dash.uid}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <a
                        href={dashUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                      >
                        {dash.title}
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                      <p className="text-xs text-muted">
                        {dash.panelCount} panels
                        {dash.missingDatasource
                          ? " · missing datasource"
                          : dash.hasRecentData
                            ? " · healthy"
                            : " · stale or empty"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        dash.missingDatasource
                          ? "warning"
                          : dash.hasRecentData
                            ? "success"
                            : "muted"
                      }
                    >
                      {dash.missingDatasource
                        ? "Gap"
                        : dash.hasRecentData
                          ? "OK"
                          : "Review"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {gaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coverage gaps</CardTitle>
            <CardDescription>Areas needing observability attention</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {gaps.map((gap, i) => (
                <li
                  key={`${gap.area}-${i}`}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border-subtle bg-elevated/40 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-primary">{gap.area}</p>
                    <p className="text-xs text-secondary">{gap.gap}</p>
                  </div>
                  <Badge
                    variant={
                      gap.priority === "high"
                        ? "error"
                        : gap.priority === "medium"
                          ? "warning"
                          : "muted"
                    }
                  >
                    {gap.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {signals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operational signals</CardTitle>
            <CardDescription>Governance signals from Grafana sync</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {signals.map((signal) => (
                <li
                  key={signal.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle p-3",
                    signal.severity === "critical" && "border-error/30",
                    signal.severity === "warning" && "border-warning/30",
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-primary">{signal.label}</p>
                    <p className="text-xs text-secondary">{signal.value}</p>
                  </div>
                  <Badge
                    variant={
                      signal.severity === "critical"
                        ? "error"
                        : signal.severity === "warning"
                          ? "warning"
                          : "default"
                    }
                  >
                    {signal.severity}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  highlight = false,
}: {
  label: string;
  value: string;
  subtitle: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "border-warning/40")}>
      <CardHeader className="pb-1">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-semibold", highlight ? "text-warning" : "text-primary")}>
          {value}
        </p>
        <p className="mt-1 text-[11px] text-muted">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
