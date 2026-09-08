"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisSnapshot,
  RiskFocus,
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

type Props = {
  projectKeys: string[];
  lastSyncedAt: string | null;
};

type LoadState = "loading" | "ready" | "missing" | "error" | "empty_filter";

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

export function DeliveryAnalysisDashboard({
  projectKeys,
  lastSyncedAt,
}: Props) {
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<DeliveryAnalysisFilters>(() => ({
    projectKey:
      searchParams.get("projectKey") ?? searchParams.get("team") ?? null,
    riskFocus: parseRiskFocus(searchParams.get("riskFocus")),
    range: "30d",
    compare: "previous_sync",
  }));
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [syncedAt, setSyncedAt] = useState<string | null>(lastSyncedAt);
  const [snapshot, setSnapshot] = useState<DeliveryAnalysisSnapshot | null>(null);

  const fetchSnapshot = useCallback(async () => {
    setLoadState("loading");

    const params = new URLSearchParams({
      range: filters.range,
      riskFocus: filters.riskFocus,
      compare: filters.compare,
    });
    if (filters.projectKey) {
      params.set("projectKey", filters.projectKey);
    }

    try {
      const res = await fetch(`/api/delivery-analysis/snapshot?${params}`, {
        credentials: "same-origin",
      });

      if (res.status === 404) {
        setSnapshot(null);
        setLoadState("missing");
        return;
      }

      if (!res.ok) {
        setSnapshot(null);
        setLoadState("error");
        return;
      }

      const data = (await res.json()) as {
        source: string;
        syncedAt: string | null;
        snapshot: DeliveryAnalysisSnapshot;
      };

      setSyncedAt(data.syncedAt);
      setSnapshot(data.snapshot);

      if (data.snapshot.byProject.length === 0) {
        setLoadState("empty_filter");
      } else {
        setLoadState("ready");
      }
    } catch {
      setSnapshot(null);
      setLoadState("error");
    }
  }, [filters.range, filters.riskFocus, filters.compare, filters.projectKey]);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

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
    setFilters((prev) => ({
      ...prev,
      projectKey: prev.projectKey === key ? null : key,
    }));
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
      : loadState === "loading"
        ? "Loading…"
        : lastSyncedAt
          ? `last synced ${formatRelative(lastSyncedAt)}`
          : "not synced yet";

  return (
    <div className="space-y-[13px]">
      {staleBanner && showMetrics && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {staleBanner}
        </p>
      )}

      {loadState === "loading" && <SnapshotUnavailable variant="loading" />}

      {loadState === "missing" && (
        <SnapshotUnavailable variant="missing" projectKeys={projectKeys} onRetry={fetchSnapshot} />
      )}

      {loadState === "error" && (
        <SnapshotUnavailable variant="error" projectKeys={projectKeys} onRetry={fetchSnapshot} />
      )}

      {loadState === "empty_filter" && (
        <SnapshotUnavailable
          variant="empty_filter"
          projectKeys={projectKeys}
          filterProjectKey={filters.projectKey}
          onRetry={fetchSnapshot}
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
