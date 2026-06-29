"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CodeAnalysisFilters,
  CodeAnalysisSnapshot,
  TrendMetric,
} from "@/lib/code-analysis/types";
import {
  getAvailableMockAuthors,
  getAvailableMockRepos,
  getMockCodeAnalysisSnapshot,
} from "@/lib/code-analysis/mock-data";
import { AnalysisFiltersBar } from "@/components/code-analysis/analysis-filters";
import { buildCodeAnalysisGovernanceHighlights } from "@/lib/governance/presentation";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { AiRiskCard } from "@/components/code-analysis/ai-risk-card";
import { KpiStrip } from "@/components/code-analysis/kpi-strip";
import { AttributionChart } from "@/components/code-analysis/attribution-chart";
import { TrendChart } from "@/components/code-analysis/trend-chart";
import { AuthorBreakdown, RepoBreakdown } from "@/components/code-analysis/repo-breakdown";
import { AnalysisTabs } from "@/components/code-analysis/analysis-tabs";
import { GovernanceSignalsCard } from "@/components/code-analysis/governance-signals";

type Props = {
  lastSyncedAt: string | null;
  connectedRepos?: string[];
};

type SnapshotSource = "mock" | "github" | "loading";

export function CodeAnalysisDashboard({ lastSyncedAt, connectedRepos }: Props) {
  const allRepos = connectedRepos?.length ? connectedRepos : getAvailableMockRepos();

  const [filters, setFilters] = useState<CodeAnalysisFilters>({
    repos: allRepos,
    branch: "default",
    range: "30d",
    author: null,
  });
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("lines");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [source, setSource] = useState<SnapshotSource>("loading");
  const [syncedAt, setSyncedAt] = useState<string | null>(lastSyncedAt);
  const [liveSnapshot, setLiveSnapshot] = useState<CodeAnalysisSnapshot | null>(null);
  const [jiraSiteUrl, setJiraSiteUrl] = useState<string | null>(null);

  const mockSnapshot = useMemo(
    () => getMockCodeAnalysisSnapshot(filters),
    [filters],
  );

  const authors = useMemo(() => {
    if (source === "github" && liveSnapshot) {
      return [...new Set(liveSnapshot.commits.map((c) => c.author))].sort();
    }
    return getAvailableMockAuthors();
  }, [source, liveSnapshot]);

  const snapshot = source === "github" && liveSnapshot ? liveSnapshot : mockSnapshot;

  const governanceHighlights = useMemo(
    () => buildCodeAnalysisGovernanceHighlights(snapshot.governanceSignals),
    [snapshot.governanceSignals],
  );

  const fetchSnapshot = useCallback(async () => {
    const params = new URLSearchParams({
      range: filters.range,
      repos: filters.repos.join(","),
    });
    if (filters.author) params.set("author", filters.author);

    const res = await fetch(`/api/code-analysis/snapshot?${params}`, {
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      source: SnapshotSource;
      syncedAt: string | null;
      snapshot: CodeAnalysisSnapshot;
      jiraSiteUrl?: string | null;
    };
    setSource(data.source === "github" ? "github" : "mock");
    setSyncedAt(data.syncedAt);
    setJiraSiteUrl(data.jiraSiteUrl ?? null);
    if (data.source === "github") {
      setLiveSnapshot(data.snapshot);
    } else {
      setLiveSnapshot(null);
    }
  }, [filters.range, filters.repos, filters.author]);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  const lastSyncedLabel =
    source === "github" && syncedAt
      ? `Live data · last analyzed ${formatRelative(syncedAt)}`
      : source === "loading"
        ? "Loading…"
        : lastSyncedAt
          ? `Last synced ${formatRelative(lastSyncedAt)} · run analysis for live data`
          : "Mock data · run analysis for live GitHub data";

  function updateFilters(next: Partial<CodeAnalysisFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  function handleRepoSelect(repo: string) {
    setFilters((prev) => {
      const isOnly = prev.repos.length === 1 && prev.repos[0] === repo;
      return {
        ...prev,
        repos: isOnly ? allRepos : [repo],
      };
    });
  }

  function handleAuthorSelect(login: string) {
    setFilters((prev) => ({
      ...prev,
      author: prev.author === login ? null : login,
    }));
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/code-analysis/analyze", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; summary?: string };
      if (!res.ok) {
        setSyncError(data.error ?? "Analysis failed");
        return;
      }
      setSyncMessage(data.summary ?? "Analysis complete");
      await fetchSnapshot();
    } catch {
      setSyncError("Analysis request failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleExport() {
    const params = new URLSearchParams({
      range: filters.range,
      repos: filters.repos.join(","),
    });
    window.location.href = `/api/code-analysis/export?${params}`;
  }

  const selectedRepo = filters.repos.length === 1 ? filters.repos[0] : null;

  return (
    <div className="space-y-6">
      <AnalysisFiltersBar
        filters={filters}
        repos={allRepos}
        authors={authors}
        onChange={updateFilters}
        onSync={handleSync}
        onExport={handleExport}
        syncing={syncing}
        lastSyncedLabel={lastSyncedLabel}
      />

      {source === "mock" && (
        <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-secondary">
          Showing demo data. Click <strong className="text-primary">Sync now</strong> to analyze
          your selected GitHub repositories.
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
        {filters.author ? ` · ${filters.author}` : ""}
        {selectedRepo ? ` · ${selectedRepo}` : ` · ${filters.repos.length} repos`}
        · Estimates from commit/PR markers — not all AI tools leave traces.
      </p>

      <BriefingHighlights highlights={governanceHighlights} />

      <KpiStrip kpis={snapshot.kpis} />

      <AiRiskCard aiRisk={snapshot.aiRisk} />

      <div className="grid gap-6 lg:grid-cols-2">
        <AttributionChart attribution={snapshot.attribution} />
        <TrendChart trend={snapshot.trend} metric={trendMetric} onMetricChange={setTrendMetric} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RepoBreakdown
          items={snapshot.byRepo}
          onSelectRepo={handleRepoSelect}
          selectedRepo={selectedRepo}
        />
        <AuthorBreakdown
          items={snapshot.byAuthor}
          onSelectAuthor={handleAuthorSelect}
          selectedAuthor={filters.author}
        />
      </div>

      {snapshot.governanceSignals.length > 0 && (
        <GovernanceSignalsCard signals={snapshot.governanceSignals} />
      )}

      <AnalysisTabs snapshot={snapshot} jiraSiteUrl={jiraSiteUrl} />
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
