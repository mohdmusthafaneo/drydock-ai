"use client";

import { useMemo, useState } from "react";
import type { ObservabilityAnalysisFilters } from "@/lib/observability-analysis/types";
import { AnalysisFiltersBar } from "@/components/observability/analysis-filters";
import { KpiStrip } from "@/components/observability/kpi-strip";
import { HealthMixChart } from "@/components/observability/health-mix-chart";
import { TrendChart } from "@/components/observability/trend-chart";
import { ServiceBreakdown } from "@/components/observability/service-breakdown";
import { ResourcePressureCards } from "@/components/observability/resource-pressure-cards";
import { OperationalSignalsCard } from "@/components/observability/operational-signals";
import { AnalysisTabs } from "@/components/observability/analysis-tabs";
import { CollectTelemetryButton } from "@/components/observability/collect-telemetry-button";
import { useAppData, useFilters, useSetFilter } from "@/lib/store";

type Props = {
  canSync?: boolean;
};

export function ObservabilityDashboard({ canSync = false }: Props) {
  const storeSnapshot = useAppData((s) => s.data.observability.snapshot);
  const availableScopes = useAppData((s) => s.data.observability.availableServiceScopes);
  const lastSyncAt = useAppData((s) => s.data.meta.lastSyncAt);
  const storeFilters = useFilters();
  const setFilter = useSetFilter();

  const serviceIds = availableScopes.map((s) => s.id);

  const filters: ObservabilityAnalysisFilters = useMemo(
    () => ({
      serviceId: storeFilters.serviceId,
      environment:
        (storeFilters.environment as ObservabilityAnalysisFilters["environment"] | null) ??
        "all",
      range: (storeFilters.range as ObservabilityAnalysisFilters["range"] | null) ?? "30d",
      compare: "previous_sync",
      riskFocus:
        (storeFilters.riskFocus as ObservabilityAnalysisFilters["riskFocus"] | null) ?? "all",
    }),
    [
      storeFilters.serviceId,
      storeFilters.environment,
      storeFilters.range,
      storeFilters.riskFocus,
    ],
  );

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const snapshot = useMemo(() => {
    if (!storeSnapshot) return null;
    if (!filters.serviceId) return storeSnapshot;
    const byService = storeSnapshot.byService.filter((s) => s.id === filters.serviceId);
    if (byService.length === 0) return storeSnapshot;
    return { ...storeSnapshot, byService };
  }, [filters.serviceId, storeSnapshot]);

  const environmentLabel =
    filters.environment === "all" ? "all environments" : filters.environment;

  const lastSyncedLabel = lastSyncAt
    ? `Last synced ${formatRelative(lastSyncAt)}`
    : "From store";

  function updateFilters(next: Partial<ObservabilityAnalysisFilters>) {
    setFilter({
      ...(next.serviceId !== undefined ? { serviceId: next.serviceId } : {}),
      ...(next.environment !== undefined ? { environment: next.environment } : {}),
      ...(next.range !== undefined ? { range: next.range } : {}),
      ...(next.riskFocus !== undefined ? { riskFocus: next.riskFocus } : {}),
    });
  }

  function handleServiceSelect(id: string) {
    setFilter({ serviceId: filters.serviceId === id ? null : id });
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

  if (!snapshot) {
    return (
      <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-secondary">
        No observability snapshot in the store yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">
          Prometheus operational intelligence · {serviceIds.length} service
          {serviceIds.length === 1 ? "" : "s"}
          {lastSyncAt ? ` · last synced ${formatRelative(lastSyncAt)}` : ""}
        </p>
        <CollectTelemetryButton />
      </div>

      <AnalysisFiltersBar
        filters={filters}
        serviceIds={serviceIds}
        onChange={updateFilters}
        onSync={handleSync}
        onExport={handleExport}
        syncing={syncing}
        canSync={canSync}
        lastSyncedLabel={lastSyncedLabel}
        exportDisabled
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
