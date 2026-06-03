"use client";

import { useMemo, useState } from "react";
import type { CodeAnalysisFilters, TrendMetric } from "@/lib/code-analysis/types";
import {
  getAvailableMockAuthors,
  getAvailableMockRepos,
  getMockCodeAnalysisSnapshot,
} from "@/lib/code-analysis/mock-data";
import { AnalysisFiltersBar } from "@/components/code-analysis/analysis-filters";
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

export function CodeAnalysisDashboard({ lastSyncedAt, connectedRepos }: Props) {
  const allRepos = connectedRepos?.length ? connectedRepos : getAvailableMockRepos();
  const authors = getAvailableMockAuthors();

  const [filters, setFilters] = useState<CodeAnalysisFilters>({
    repos: allRepos,
    branch: "default",
    range: "30d",
    author: null,
  });
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("lines");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const snapshot = useMemo(
    () => getMockCodeAnalysisSnapshot(filters),
    [filters],
  );

  const lastSyncedLabel = lastSyncedAt
    ? `Last synced ${formatRelative(lastSyncedAt)} · mock data`
    : "Mock data · connect GitHub for live analysis (Phase 2)";

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

  function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    window.setTimeout(() => {
      setSyncing(false);
      setSyncMessage("Live GitHub analysis sync ships in Phase 2.");
    }, 1200);
  }

  function handleExport() {
    const header = "repo,pr_number,title,author,merged_at,ai_attribution,confidence,reviews\n";
    const rows = snapshot.pullRequests
      .map(
        (p) =>
          `"${p.repo}",${p.number},"${p.title.replace(/"/g, '""')}",${p.author},${p.mergedAt},${p.attribution},${p.confidence},${p.reviewCount}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code-analysis-${filters.range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      {syncMessage && (
        <p className="rounded-lg border border-brand/30 bg-brand-muted px-3 py-2 text-sm text-brand">
          {syncMessage}
        </p>
      )}

      <p className="text-xs text-muted">
        {snapshot.rangeLabel}
        {filters.author ? ` · ${filters.author}` : ""}
        {selectedRepo ? ` · ${selectedRepo}` : ` · ${filters.repos.length} repos`}
        · Estimates from commit/PR markers — not all AI tools leave traces.
      </p>

      <KpiStrip kpis={snapshot.kpis} />

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
