"use client";

import { useMemo, useState } from "react";
import type { ObservabilityAnalysisFilters } from "@/lib/observability-analysis/types";
import { getMockObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/mock-data";
import { AnalysisFiltersBar } from "@/components/observability/analysis-filters";
import { KpiStrip } from "@/components/observability/kpi-strip";
import { HealthMixChart } from "@/components/observability/health-mix-chart";
import { TrendChart } from "@/components/observability/trend-chart";
import { ServiceBreakdown } from "@/components/observability/service-breakdown";
import { ResourcePressureCards } from "@/components/observability/resource-pressure-cards";
import { OperationalSignalsCard } from "@/components/observability/operational-signals";
import { AnalysisTabs } from "@/components/observability/analysis-tabs";
import { CollectTelemetryButton } from "@/components/observability/collect-telemetry-button";

type Props = {
  serviceIds: string[];
  lastSyncedAt: string | null;
  canSync: boolean;
  isMockData?: boolean;
};

export function ObservabilityDashboard({
  serviceIds,
  lastSyncedAt,
  canSync,
  isMockData = true,
}: Props) {
  const [filters, setFilters] = useState<ObservabilityAnalysisFilters>({
    serviceId: null,
    environment: "all",
    range: "30d",
    compare: "previous_sync",
    riskFocus: "all",
  });
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const snapshot = useMemo(
    () => getMockObservabilityAnalysisSnapshot(filters),
    [filters],
  );

  const environmentLabel =
    filters.environment === "all" ? "all environments" : filters.environment;

  const lastSyncedLabel = isMockData
    ? "Mock data · sync Prometheus for live metrics"
    : lastSyncedAt
      ? `Live data · last synced ${formatRelative(lastSyncedAt)}`
      : "Not synced yet";

  function updateFilters(next: Partial<ObservabilityAnalysisFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  function handleServiceSelect(id: string) {
    setFilters((prev) => ({
      ...prev,
      serviceId: prev.serviceId === id ? null : id,
    }));
  }

  async function handleSync() {
    if (!canSync) return;
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/integrations/prometheus/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.status === 404) {
        setSyncError("Prometheus sync ships in P2 — use Integrations for now.");
        return;
      }
      const data = (await res.json()) as { ok?: boolean; error?: string; summary?: string };
      if (!res.ok) {
        setSyncError(data.error ?? "Sync failed");
        return;
      }
      setSyncMessage(data.summary ?? "Prometheus sync complete");
    } catch {
      setSyncError("Sync request failed");
    } finally {
      setSyncing(false);
    }
  }

  function handleExport() {
    setSyncError("Export ships in P2 — snapshot API not yet available.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">
          Prometheus operational intelligence · {serviceIds.length} service
          {serviceIds.length === 1 ? "" : "s"}
          {lastSyncedAt && !isMockData
            ? ` · last synced ${formatRelative(lastSyncedAt)}`
            : ""}
        </p>
        <CollectTelemetryButton />
      </div>

      {isMockData && (
        <p className="rounded-lg border border-brand/30 bg-brand-muted px-3 py-2 text-sm text-brand">
          UI preview with mock data — connect and sync Prometheus on Integrations for live
          operational metrics (P2).
        </p>
      )}

      <AnalysisFiltersBar
        filters={filters}
        serviceIds={serviceIds}
        onChange={updateFilters}
        onSync={handleSync}
        onExport={handleExport}
        syncing={syncing}
        canSync={canSync}
        lastSyncedLabel={lastSyncedLabel}
        exportDisabled={isMockData}
      />

      {syncMessage && (
        <p className="rounded-lg border border-brand/30 bg-brand-muted px-3 py-2 text-sm text-brand">
          {syncMessage}
        </p>
      )}

      {syncError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {syncError}
        </p>
      )}

      <p className="text-xs text-muted">
        {filters.range} range · {environmentLabel}
        {filters.serviceId ? ` · ${filters.serviceId}` : ` · ${snapshot.byService.length} services`}
        · Metrics from PromQL at last sync — not live Prometheus.
      </p>

      <KpiStrip
        kpis={snapshot.kpis}
        serviceCount={snapshot.byService.length}
        environmentLabel={environmentLabel}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <HealthMixChart healthMix={snapshot.healthMix} />
        <TrendChart trend={snapshot.trend} hasHistory={snapshot.trend.length >= 2} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ServiceBreakdown
          items={snapshot.byService}
          onSelectService={handleServiceSelect}
          selectedService={filters.serviceId}
        />
        <ResourcePressureCards services={snapshot.byService} />
      </div>

      <OperationalSignalsCard signals={snapshot.signals} />

      <AnalysisTabs snapshot={snapshot} />
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
