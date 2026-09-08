"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DEFAULT_CODE_ANALYSIS_RANGE } from "@/lib/code-analysis/default-filters";
import type {
  CodeAnalysisFilters,
  TimeRange,
  TrendMetric,
} from "@/lib/code-analysis/types";
import { getMockCodeAnalysisSnapshot } from "@/lib/store/mock/code-analysis";
import { buildCodeAnalysisGovernanceHighlights } from "@/lib/governance/presentation";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { AiRiskCard } from "@/components/code-analysis/ai-risk-card";
import { AccountabilityCard } from "@/components/code-analysis/accountability-card";
import { KpiStrip } from "@/components/code-analysis/kpi-strip";
import { AttributionChart } from "@/components/code-analysis/attribution-chart";
import { TrendChart } from "@/components/code-analysis/trend-chart";
import { AuthorBreakdown, RepoBreakdown } from "@/components/code-analysis/repo-breakdown";
import { AnalysisTabs } from "@/components/code-analysis/analysis-tabs";
import { GovernanceSignalsCard } from "@/components/code-analysis/governance-signals";
import { ComplianceFindingsPanel } from "@/components/governance/compliance-findings-panel";
import type { ComplianceFindingView } from "@/lib/compliance/types";
import {
  selectAiRiskPct,
  useAppData,
  useFilters,
  useSetFilter,
} from "@/lib/store";

type Props = {
  complianceFindings?: ComplianceFindingView[];
  complianceOpenCount?: number;
  complianceCriticalOpen?: number;
  showCompliancePanel?: boolean;
  canManageCompliance?: boolean;
};

export function CodeAnalysisDashboard({
  complianceFindings = [],
  complianceOpenCount = 0,
  complianceCriticalOpen = 0,
  showCompliancePanel = false,
  canManageCompliance = false,
}: Props) {
  const availableRepos = useAppData((s) => s.data.codeAnalysis.availableRepos);
  const lastSyncAt = useAppData((s) => s.data.meta.lastSyncAt);
  const mode = useAppData((s) => s.data.meta.mode);
  const aiRiskPct = useAppData(selectAiRiskPct);
  const storeFilters = useFilters();
  const setFilter = useSetFilter();

  const allRepos = availableRepos.length
    ? availableRepos
    : ["aidos-neo/platform", "aidos-neo/web-client", "aidos-neo/api-gateway"];

  const filters: CodeAnalysisFilters = useMemo(
    () => ({
      repos: storeFilters.repos.length > 0 ? storeFilters.repos : allRepos,
      branch:
        storeFilters.branch === "all" || storeFilters.branch === "default"
          ? storeFilters.branch
          : "default",
      range: (storeFilters.range as TimeRange | null) ?? DEFAULT_CODE_ANALYSIS_RANGE,
      author: storeFilters.author,
    }),
    [storeFilters.repos, storeFilters.branch, storeFilters.range, storeFilters.author, allRepos],
  );

  const [trendMetric, setTrendMetric] = useState<TrendMetric>("lines");

  const baseSnapshot = useMemo(
    () => getMockCodeAnalysisSnapshot(filters),
    [filters],
  );

  const snapshot = useMemo(
    () => ({
      ...baseSnapshot,
      kpis: {
        ...baseSnapshot.kpis,
        aiLinesPct: aiRiskPct,
      },
      aiRisk: {
        ...baseSnapshot.aiRisk,
        aiLinesPct: aiRiskPct,
        highRiskCount: 0,
      },
    }),
    [aiRiskPct, baseSnapshot],
  );

  const governanceHighlights = useMemo(
    () => buildCodeAnalysisGovernanceHighlights(snapshot.governanceSignals),
    [snapshot.governanceSignals],
  );

  function handleRepoSelect(repo: string) {
    const isOnly = filters.repos.length === 1 && filters.repos[0] === repo;
    setFilter({ repos: isOnly ? allRepos : [repo] });
  }

  const selectedRepo = filters.repos.length === 1 ? filters.repos[0] : null;
  const demoMode = mode !== "live";

  const syncMeta = lastSyncAt
    ? `Demo evidence · last synced ${formatRelative(lastSyncAt)}`
    : "Demo evidence";

  return (
    <div className="space-y-[13px]">
      {demoMode && (
        <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-secondary">
          Showing demo data aligned with Overview. Run analysis from{" "}
          <Link href="/integrations" className="font-medium text-primary underline-offset-2 hover:underline">
            Integrations
          </Link>{" "}
          for live GitHub metrics.
        </p>
      )}

      <p className="text-xs text-muted">
        {snapshot.rangeLabel}
        {selectedRepo ? ` · ${selectedRepo}` : ` · ${filters.repos.length} repos`}
        {" · "}
        {syncMeta}
        · Estimates from commit/PR markers — not all AI tools leave traces.
      </p>

      <BriefingHighlights highlights={governanceHighlights} />

      <KpiStrip kpis={snapshot.kpis} />

      <AiRiskCard aiRisk={snapshot.aiRisk} />

      <AccountabilityCard
        accountability={snapshot.accountability}
        needsOwnershipBackfill={snapshot.pullRequests.some(
          (pr) => (pr.files?.length ?? 0) === 0,
        )}
      />

      {showCompliancePanel && (
        <ComplianceFindingsPanel
          findings={complianceFindings}
          openCount={complianceOpenCount}
          criticalOpen={complianceCriticalOpen}
          canManage={canManageCompliance}
        />
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <AttributionChart attribution={snapshot.attribution} />
        <TrendChart trend={snapshot.trend} metric={trendMetric} onMetricChange={setTrendMetric} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <RepoBreakdown
          items={snapshot.byRepo}
          onSelectRepo={handleRepoSelect}
          selectedRepo={selectedRepo}
        />
        <AuthorBreakdown items={snapshot.byAuthor} />
      </div>

      {snapshot.governanceSignals.length > 0 && (
        <GovernanceSignalsCard signals={snapshot.governanceSignals} />
      )}

      <AnalysisTabs
        snapshot={snapshot}
        jiraSiteUrl="https://aidos.atlassian.net"
        needsReviewerBackfill={snapshot.pullRequests.some(
          (pr) => pr.reviewCount > 0 && (pr.reviewers?.length ?? 0) === 0,
        )}
      />
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
