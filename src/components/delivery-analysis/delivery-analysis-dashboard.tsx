"use client";

import { useMemo, useState } from "react";
import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisSnapshot,
  RiskFocus,
  TimeRange,
  CompareMode,
} from "@/lib/delivery-analysis/types";
import { buildDeliveryConfidenceOneLiner } from "@/lib/governance/presentation";
import { ExecutiveVerdictBanner } from "@/components/executive-briefing/executive-verdict-banner";
import { KpiStrip } from "@/components/delivery-analysis/kpi-strip";
import { RiskMixChart } from "@/components/delivery-analysis/risk-mix-chart";
import { TrendChart } from "@/components/delivery-analysis/trend-chart";
import { ProjectBreakdown } from "@/components/delivery-analysis/project-breakdown";
import { SprintCards } from "@/components/delivery-analysis/sprint-cards";
import { DeliverySignalsCard } from "@/components/delivery-analysis/delivery-signals";
import {
  JiraHygieneBanner,
  JiraHygieneFindingsCard,
} from "@/components/delivery-analysis/jira-hygiene-banner";
import { AnalysisTabs } from "@/components/delivery-analysis/analysis-tabs";
import { SnapshotUnavailable } from "@/components/delivery-analysis/snapshot-unavailable";
import { useAppData, useFilters, useSetFilter } from "@/lib/store";

type Props = {
  projectKeys: string[];
  lastSyncedAt: string | null;
  /** Prefer URL/team filter when provided. */
  initialProjectKey?: string | null;
};

const RISK_FOCUS_VALUES: RiskFocus[] = [
  "all",
  "blockers",
  "schedule",
  "quality",
  "sprint",
];

function parseRiskFocus(value: string | null): RiskFocus {
  if (value && (RISK_FOCUS_VALUES as string[]).includes(value)) {
    return value as RiskFocus;
  }
  return "all";
}

function filterSnapshot(
  snapshot: DeliveryAnalysisSnapshot,
  filters: DeliveryAnalysisFilters,
): DeliveryAnalysisSnapshot {
  if (!filters.projectKey) return snapshot;

  const byProject = snapshot.byProject.filter((p) => p.key === filters.projectKey);
  if (byProject.length === 0) {
    return { ...snapshot, byProject: [], projectKeys: [] };
  }

  const project = byProject[0]!;
  return {
    ...snapshot,
    projectKeys: [project.key],
    byProject,
    sprints: snapshot.sprints.filter((s) => s.projectKey === project.key),
    versions: snapshot.versions.filter((v) => v.projectKey === project.key),
    kpis: {
      ...snapshot.kpis,
      openWork: project.openIssues,
      blocked: project.blockedCount,
      overdue: project.overdueCount,
      spillover: project.spilloverCount,
      bugsOpen: project.bugsOpen,
      sprintCompletionPct: project.activeSprint?.pct ?? snapshot.kpis.sprintCompletionPct,
      healthScore: project.healthScore,
    },
    riskMix: {
      blocked: project.blockedCount,
      overdue: project.overdueCount,
      bugs: project.bugsOpen,
      otherOpen: Math.max(
        0,
        project.openIssues - project.blockedCount - project.overdueCount - project.bugsOpen,
      ),
    },
  };
}

export function DeliveryAnalysisDashboard({
  projectKeys,
  lastSyncedAt,
  initialProjectKey = null,
}: Props) {
  const storeSnapshot = useAppData((s) => s.data.deliveryAnalysis.snapshot);
  const storeFilters = useFilters();
  const setFilter = useSetFilter();

  const filters: DeliveryAnalysisFilters = useMemo(
    () => ({
      projectKey:
        storeFilters.projectKey ??
        storeFilters.team ??
        initialProjectKey ??
        null,
      riskFocus: parseRiskFocus(storeFilters.riskFocus),
      range: (storeFilters.range as TimeRange | null) ?? "30d",
      compare: (storeFilters.compare as CompareMode | null) ?? "previous_sync",
    }),
    [
      storeFilters.projectKey,
      storeFilters.team,
      storeFilters.riskFocus,
      storeFilters.range,
      storeFilters.compare,
      initialProjectKey,
    ],
  );

  const [localError] = useState(false);

  const snapshot = useMemo(() => {
    if (!storeSnapshot) return null;
    return filterSnapshot(storeSnapshot, filters);
  }, [storeSnapshot, filters]);

  const loadState = !storeSnapshot
    ? "missing"
    : localError
      ? "error"
      : snapshot && snapshot.byProject.length === 0
        ? "empty_filter"
        : snapshot
          ? "ready"
          : "missing";

  const syncedAt = lastSyncedAt;

  const staleBanner = useMemo(() => {
    const at = loadState === "ready" ? syncedAt : lastSyncedAt;
    if (!at) return null;
    const hours = (Date.now() - new Date(at).getTime()) / 3600000;
    if (hours > 24) {
      return `Last synced ${formatRelative(at)} — data may be stale. Sync on Integrations for fresh counts.`;
    }
    return null;
  }, [loadState, syncedAt, lastSyncedAt]);

  function handleProjectSelect(key: string) {
    setFilter({ projectKey: filters.projectKey === key ? null : key });
  }

  const selectedProject = filters.projectKey;
  const showMetrics = loadState === "ready" && snapshot;

  const deliveryVerdict = useMemo(() => {
    if (!snapshot) return null;
    const activeSprint = snapshot.sprints.find((s) => s.state === "active");
    return buildDeliveryConfidenceOneLiner({
      healthScore: snapshot.kpis.healthScore,
      blocked: snapshot.kpis.blocked,
      overdue: snapshot.kpis.overdue,
      sprintCompletionPct: activeSprint?.pct ?? snapshot.kpis.sprintCompletionPct,
    });
  }, [snapshot]);

  const syncMeta =
    loadState === "ready" && syncedAt
      ? `last synced ${formatRelative(syncedAt)}`
      : lastSyncedAt
        ? `last synced ${formatRelative(lastSyncedAt)}`
        : "demo evidence";

  return (
    <div className="space-y-[13px]">
      {staleBanner && showMetrics && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {staleBanner}
        </p>
      )}

      {loadState === "missing" && (
        <SnapshotUnavailable variant="missing" projectKeys={projectKeys} />
      )}

      {loadState === "error" && (
        <SnapshotUnavailable variant="error" projectKeys={projectKeys} />
      )}

      {loadState === "empty_filter" && (
        <SnapshotUnavailable
          variant="empty_filter"
          projectKeys={projectKeys}
          filterProjectKey={filters.projectKey}
        />
      )}

      {showMetrics && (
        <>
          {snapshot.kpis.calibrationPending && (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              {snapshot.kpis.calibrationMessage ??
                "Jira workflow calibration in progress — delivery scores use discounted confidence until complete."}
            </p>
          )}

          {deliveryVerdict && (
            <ExecutiveVerdictBanner
              verdict={deliveryVerdict.verdict}
              verdictLabel={deliveryVerdict.verdictLabel}
              headline={deliveryVerdict.headline}
              subcopy={deliveryVerdict.subcopy}
            />
          )}

          {snapshot.jiraHygiene && <JiraHygieneBanner hygiene={snapshot.jiraHygiene} />}

          <p className="text-xs text-muted">
            {snapshot.rangeLabel}
            {selectedProject ? ` · ${selectedProject}` : ` · ${snapshot.projectKeys.length} projects`}
            {" · "}
            {syncMeta}
            · Counts from JQL at last sync — not live Jira.
          </p>

          <KpiStrip kpis={snapshot.kpis} projectCount={snapshot.byProject.length} />

          <div className="space-y-[13px]">
            <div className="grid gap-3 lg:grid-cols-2">
              <RiskMixChart riskMix={snapshot.riskMix} />
              <TrendChart trend={snapshot.trend} hasHistory={snapshot.trend.length >= 2} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <ProjectBreakdown
                items={snapshot.byProject}
                onSelectProject={handleProjectSelect}
                selectedProject={selectedProject}
              />
              <SprintCards sprints={snapshot.sprints} siteUrl={snapshot.siteUrl} />
            </div>

            <DeliverySignalsCard
              signals={snapshot.signals}
              siteUrl={snapshot.siteUrl}
              scopeLabel={snapshot.scopeLabel}
              scopeMode={snapshot.scopeMode}
            />

            {snapshot.jiraHygiene?.findings.length ? (
              <JiraHygieneFindingsCard findings={snapshot.jiraHygiene.findings} />
            ) : null}

            <AnalysisTabs snapshot={snapshot} />
          </div>
        </>
      )}
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
