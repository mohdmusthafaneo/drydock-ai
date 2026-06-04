"use client";

import { useMemo, useState } from "react";
import type { DeliveryAnalysisFilters } from "@/lib/delivery-analysis/types";
import { getMockDeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/mock-data";
import { AnalysisFiltersBar } from "@/components/delivery-analysis/analysis-filters";
import { KpiStrip } from "@/components/delivery-analysis/kpi-strip";
import { RiskMixChart } from "@/components/delivery-analysis/risk-mix-chart";
import { TrendChart } from "@/components/delivery-analysis/trend-chart";
import { ProjectBreakdown } from "@/components/delivery-analysis/project-breakdown";
import { SprintCards } from "@/components/delivery-analysis/sprint-cards";
import { DeliverySignalsCard } from "@/components/delivery-analysis/delivery-signals";
import { AnalysisTabs } from "@/components/delivery-analysis/analysis-tabs";

type Props = {
  projectKeys: string[];
  lastSyncedAt: string | null;
  canSync: boolean;
  isDemo?: boolean;
};

export function DeliveryAnalysisDashboard({
  projectKeys,
  lastSyncedAt,
  canSync,
  isDemo = true,
}: Props) {
  const [filters, setFilters] = useState<DeliveryAnalysisFilters>({
    projectKey: null,
    riskFocus: "all",
    range: "30d",
    compare: "previous_sync",
  });
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const snapshot = useMemo(
    () => getMockDeliveryAnalysisSnapshot(filters),
    [filters],
  );

  const staleBanner = useMemo(() => {
    if (!lastSyncedAt) return null;
    const hours = (Date.now() - new Date(lastSyncedAt).getTime()) / 3600000;
    if (hours > 24) {
      return `Last synced ${formatRelative(lastSyncedAt)} — data may be stale. Sync for fresh counts.`;
    }
    return null;
  }, [lastSyncedAt]);

  const lastSyncedLabel = isDemo
    ? `Demo data · ${projectKeys.length} project${projectKeys.length === 1 ? "" : "s"}`
    : lastSyncedAt
      ? `Last synced ${formatRelative(lastSyncedAt)}`
      : "Not synced yet";

  function updateFilters(next: Partial<DeliveryAnalysisFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  function handleProjectSelect(key: string) {
    setFilters((prev) => ({
      ...prev,
      projectKey: prev.projectKey === key ? null : key,
    }));
  }

  async function handleSync() {
    if (!canSync) return;
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/integrations/jira/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; summary?: string };
      if (!res.ok) {
        setSyncError(data.error ?? "Sync failed");
        return;
      }
      setSyncMessage(data.summary ?? "Jira sync complete");
    } catch {
      setSyncError("Sync request failed");
    } finally {
      setSyncing(false);
    }
  }

  function handleExport() {
    // P2: wire export API
    setSyncMessage("Export available after live data ships (P2)");
  }

  const selectedProject = filters.projectKey;

  return (
    <div className="space-y-6">
      <AnalysisFiltersBar
        filters={filters}
        projectKeys={projectKeys}
        onChange={updateFilters}
        onSync={handleSync}
        onExport={handleExport}
        syncing={syncing}
        canSync={canSync}
        lastSyncedLabel={lastSyncedLabel}
      />

      {isDemo && (
        <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-secondary">
          Showing demo data for layout validation. Sync Jira on integrations for live delivery
          metrics (P2).
        </p>
      )}

      {staleBanner && !isDemo && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {staleBanner}
        </p>
      )}

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
        {snapshot.rangeLabel}
        {selectedProject ? ` · ${selectedProject}` : ` · ${snapshot.projectKeys.length} projects`}
        · Counts from JQL at last sync — not live Jira.
      </p>

      <KpiStrip kpis={snapshot.kpis} projectCount={snapshot.byProject.length} />

      <div className="grid gap-6 lg:grid-cols-2">
        <RiskMixChart riskMix={snapshot.riskMix} />
        <TrendChart trend={snapshot.trend} hasHistory={isDemo} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectBreakdown
          items={snapshot.byProject}
          onSelectProject={handleProjectSelect}
          selectedProject={selectedProject}
        />
        <SprintCards sprints={snapshot.sprints} siteUrl={snapshot.siteUrl} />
      </div>

      {snapshot.signals.length > 0 && (
        <DeliverySignalsCard signals={snapshot.signals} siteUrl={snapshot.siteUrl} />
      )}

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
