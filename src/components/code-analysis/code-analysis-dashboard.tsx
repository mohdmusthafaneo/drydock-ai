"use client";

import { useMemo, useState } from "react";
import { DEFAULT_CODE_ANALYSIS_RANGE } from "@/lib/code-analysis/default-filters";
import type {
  CodeAnalysisFilters,
  TimeRange,
  TrendMetric,
} from "@/lib/code-analysis/types";
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
  const storeSnapshot = useAppData((s) => s.data.codeAnalysis.snapshot);
  const availableRepos = useAppData((s) => s.data.codeAnalysis.availableRepos);
  const lastSyncAt = useAppData((s) => s.data.meta.lastSyncAt);
  const jiraSiteUrl = useAppData(
    (s) =>
      s.data.integrations.items.find((i) => i.provider.toLowerCase() === "jira")
        ?.siteUrl ?? "",
  );
  const aiRiskPct = useAppData(selectAiRiskPct);
  const storeFilters = useFilters();
  const setFilter = useSetFilter();

  const allRepos = availableRepos.length ? availableRepos : [];

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

  const snapshot = useMemo(() => {
    if (!storeSnapshot) return null;
    const selected = new Set(filters.repos);
    const filterByRepo = filters.repos.length > 0 && filters.repos.length < allRepos.length;

    let pullRequests = storeSnapshot.pullRequests;
    let commits = storeSnapshot.commits;
    let byRepo = storeSnapshot.byRepo;
    let byAuthor = storeSnapshot.byAuthor;

    if (filterByRepo) {
      pullRequests = pullRequests.filter((p) => selected.has(p.repo));
      commits = commits.filter((c) => selected.has(c.repo));
      byRepo = byRepo.filter((r) => selected.has(r.repo));
    }
    if (filters.author) {
      pullRequests = pullRequests.filter((p) => p.author === filters.author);
      commits = commits.filter((c) => c.author === filters.author);
      byAuthor = byAuthor.filter((a) => a.login === filters.author);
    }

    return {
      ...storeSnapshot,
      pullRequests,
      commits,
      byRepo,
      byAuthor,
      kpis: {
        ...storeSnapshot.kpis,
        aiLinesPct: aiRiskPct,
      },
      aiRisk: {
        ...storeSnapshot.aiRisk,
        aiLinesPct: aiRiskPct,
        highRiskCount: 0,
      },
    };
  }, [aiRiskPct, allRepos.length, filters.author, filters.repos, storeSnapshot]);

  const governanceHighlights = useMemo(
    () =>
      snapshot
        ? buildCodeAnalysisGovernanceHighlights(snapshot.governanceSignals)
        : [],
    [snapshot],
  );

  function handleRepoSelect(repo: string) {
    const isOnly = filters.repos.length === 1 && filters.repos[0] === repo;
    setFilter({ repos: isOnly ? allRepos : [repo] });
  }

  const selectedRepo = filters.repos.length === 1 ? filters.repos[0] : null;

  const syncMeta = lastSyncAt
    ? `Last synced ${formatRelative(lastSyncAt)}`
    : "From store";

  if (!snapshot) {
    return (
      <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-secondary">
        No code analysis snapshot in the store yet.
      </p>
    );
  }

  return (
    <div className="space-y-[13px]">
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
        jiraSiteUrl={jiraSiteUrl}
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
