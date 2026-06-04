"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeliveryAnalysisFilters, DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
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

type SnapshotSource = "mock" | "jira" | "loading";

export function DeliveryAnalysisDashboard({
  projectKeys,
  lastSyncedAt,
  canSync,
  isDemo = false,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<DeliveryAnalysisFilters>({
    projectKey: null,
    riskFocus: "all",
    range: "30d",
    compare: "previous_sync",
  });
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [source, setSource] = useState<SnapshotSource>(isDemo ? "mock" : "loading");
  const [syncedAt, setSyncedAt] = useState<string | null>(lastSyncedAt);
  const [liveSnapshot, setLiveSnapshot] = useState<DeliveryAnalysisSnapshot | null>(null);

  const mockSnapshot = useMemo(
    () => getMockDeliveryAnalysisSnapshot(filters),
    [filters],
  );

  const snapshot =
    source === "jira" && liveSnapshot ? liveSnapshot : mockSnapshot;

  const fetchSnapshot = useCallback(async () => {
    if (isDemo) {
      setSource("mock");
      return;
    }

    const params = new URLSearchParams({
      range: filters.range,
      riskFocus: filters.riskFocus,
      compare: filters.compare,
    });
    if (filters.projectKey) {
      params.set("projectKey", filters.projectKey);
    }

    const res = await fetch(`/api/delivery-analysis/snapshot?${params}`, {
      credentials: "same-origin",
    });

    if (res.status === 404) {
      setSource("loading");
      setLiveSnapshot(null);
      return;
    }

    if (!res.ok) {
      setSource("mock");
      return;
    }

    const data = (await res.json()) as {
      source: string;
      syncedAt: string | null;
      snapshot: DeliveryAnalysisSnapshot;
    };

    setSource(data.source === "jira" ? "jira" : "mock");
    setSyncedAt(data.syncedAt);
    if (data.source === "jira") {
      setLiveSnapshot(data.snapshot);
    } else {
      setLiveSnapshot(null);
    }
  }, [filters.range, filters.riskFocus, filters.compare, filters.projectKey, isDemo]);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  const staleBanner = useMemo(() => {
    const at = source === "jira" ? syncedAt : lastSyncedAt;
    if (!at) return null;
    const hours = (Date.now() - new Date(at).getTime()) / 3600000;
    if (hours > 24) {
      return `Last synced ${formatRelative(at)} — data may be stale. Sync for fresh counts.`;
    }
    return null;
  }, [source, syncedAt, lastSyncedAt]);

  const lastSyncedLabel =
    isDemo
      ? `Demo data · ${projectKeys.length} project${projectKeys.length === 1 ? "" : "s"}`
      : source === "jira" && syncedAt
        ? `Live data · last synced ${formatRelative(syncedAt)}`
        : source === "loading"
          ? "Loading…"
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
      await fetchSnapshot();
      router.refresh();
    } catch {
      setSyncError("Sync request failed");
    } finally {
      setSyncing(false);
    }
  }

  function handleExport() {
    const params = new URLSearchParams({
      range: filters.range,
      riskFocus: filters.riskFocus,
    });
    if (filters.projectKey) {
      params.set("projectKey", filters.projectKey);
    }
    window.location.href = `/api/delivery-analysis/export?${params}`;
  }

  const selectedProject = filters.projectKey;
  const showDemoBanner = isDemo || source === "mock";

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

      {showDemoBanner && (
        <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-secondary">
          {isDemo
            ? "Showing demo data for layout validation. Sync Jira on integrations for live delivery metrics."
            : "Could not load live snapshot. Sync Jira on Integrations, then refresh this page."}
        </p>
      )}

      {staleBanner && source === "jira" && (
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
        <TrendChart trend={snapshot.trend} hasHistory={source === "mock" && snapshot.trend.length >= 2} />
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
