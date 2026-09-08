"use client";

import { useMemo, useState } from "react";
import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisSnapshot,
  RiskFocus,
  TimeRange,
  CompareMode,
} from "@/lib/delivery-analysis/types";
import {
  resolveActiveSprintCards,
  type OverviewSprintCompletion,
} from "@/lib/delivery-analysis/sprint-display";
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
import { ScoreDerivationPanel } from "@/components/delivery-analysis/score-derivation-panel";
import { SnapshotUnavailable } from "@/components/delivery-analysis/snapshot-unavailable";
import { MOCK_DEFAULT_SPRINT_ID } from "@/lib/store/mock/dimensions";
import {
  selectOverviewModel,
  useAppData,
  useFilters,
  useSetFilter,
} from "@/lib/store";

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
  const overviewModel = useAppData((s) => selectOverviewModel(s));
  const deliveryConfidence = overviewModel.deliveryConfidence;
  const dimensions = useAppData((s) => s.data.dimensions);
  const storeFilters = useFilters();
  const setFilter = useSetFilter();

  const effectiveSprintId =
    storeFilters.sprint ??
    dimensions.sprints.find((s) => s.id === MOCK_DEFAULT_SPRINT_ID)?.id ??
    dimensions.sprints[0]?.id ??
    null;

  const selectedSprintMeta = useMemo(() => {
    if (!effectiveSprintId) return null;
    const sprint =
      dimensions.sprints.find((s) => s.id === effectiveSprintId) ?? null;
    if (!sprint) return null;
    return {
      id: sprint.id,
      name: sprint.name,
      start: sprint.start,
      end: sprint.end,
      rangeLabel: sprint.rangeLabel,
    };
  }, [dimensions.sprints, effectiveSprintId]);

  const overviewCompletion = useMemo((): OverviewSprintCompletion | null => {
    const pct = metricValue(deliveryConfidence.metrics, "completion");
    const annotation = deliveryConfidence.metrics.find(
      (m) => m.id === "completion",
    )?.annotation;
    if (pct == null) return null;
    const match = annotation?.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) {
      const fromBurndown = overviewModel.burndown;
      if (fromBurndown.total > 0) {
        return {
          done: fromBurndown.completed,
          total: fromBurndown.total,
          pct,
        };
      }
      return null;
    }
    return {
      done: Number(match[1]),
      total: Number(match[2]),
      pct,
    };
  }, [deliveryConfidence.metrics, overviewModel.burndown]);

  const teamName = useMemo(() => {
    const key = storeFilters.team;
    if (!key) return null;
    return dimensions.teams.find((t) => t.key === key)?.name ?? key;
  }, [dimensions.teams, storeFilters.team]);

  /** Prefer explicit projectKey; only use team as project when it exists in Delivery projects. */
  const deliveryProjectKey = useMemo(() => {
    const explicit = storeFilters.projectKey ?? initialProjectKey ?? null;
    if (explicit) return explicit;
    const team = storeFilters.team;
    if (!team || !storeSnapshot) return null;
    const known = new Set([
      ...storeSnapshot.projectKeys,
      ...storeSnapshot.byProject.map((p) => p.key),
    ]);
    return known.has(team) ? team : null;
  }, [
    storeFilters.projectKey,
    storeFilters.team,
    initialProjectKey,
    storeSnapshot,
  ]);

  const filters: DeliveryAnalysisFilters = useMemo(
    () => ({
      projectKey: deliveryProjectKey,
      riskFocus: parseRiskFocus(storeFilters.riskFocus),
      range: (storeFilters.range as TimeRange | null) ?? "30d",
      compare: (storeFilters.compare as CompareMode | null) ?? "previous_sync",
    }),
    [
      deliveryProjectKey,
      storeFilters.riskFocus,
      storeFilters.range,
      storeFilters.compare,
    ],
  );

  const [localError] = useState(false);

  const snapshot = useMemo(() => {
    if (!storeSnapshot) return null;
    const filtered = filterSnapshot(storeSnapshot, filters);
    const sprintOverlay = selectedSprintMeta
      ? {
          rangeLabel: selectedSprintMeta.rangeLabel ?? filtered.rangeLabel,
          scopeLabel: selectedSprintMeta.name,
          scopeMode: "sprint" as const,
          byProject: filtered.byProject.map((p) =>
            p.activeSprint
              ? {
                  ...p,
                  activeSprint: {
                    ...p.activeSprint,
                    name: selectedSprintMeta.name,
                  },
                }
              : p,
          ),
        }
      : {};

    // Project drill-down keeps local KPIs; otherwise overlay sprint/team-aware Overview counts.
    if (filters.projectKey) {
      return { ...filtered, ...sprintOverlay };
    }

    const blocked = metricValue(deliveryConfidence.metrics, "blocked");
    const spillover = metricValue(deliveryConfidence.metrics, "spillover");
    const completion = metricValue(deliveryConfidence.metrics, "completion");

    return {
      ...filtered,
      ...sprintOverlay,
      kpis: {
        ...filtered.kpis,
        healthScore: deliveryConfidence.score,
        ...(blocked != null ? { blocked } : {}),
        ...(spillover != null ? { spillover } : {}),
        ...(completion != null ? { sprintCompletionPct: completion } : {}),
        ...(overviewCompletion && overviewCompletion.total > 0
          ? { openWork: overviewCompletion.total }
          : {}),
      },
      riskMix: {
        ...filtered.riskMix,
        ...(blocked != null ? { blocked } : {}),
      },
    };
  }, [
    storeSnapshot,
    filters,
    deliveryConfidence,
    overviewCompletion,
    selectedSprintMeta,
  ]);

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

  const activeSprintCards = useMemo(() => {
    if (!snapshot) return [];
    const orgKey =
      snapshot.sprints[0]?.projectKey ??
      dimensions.projects[0]?.key ??
      "TP";
    const orgName =
      snapshot.sprints[0]?.projectName ??
      dimensions.projects[0]?.name ??
      "TPT Platform";
    return resolveActiveSprintCards({
      sprints: snapshot.sprints,
      selectedSprint: selectedSprintMeta,
      overviewCompletion,
      teamKey: storeFilters.team,
      teamName,
      fallbackProjectKey: orgKey,
      fallbackProjectName: orgName,
    });
  }, [
    snapshot,
    selectedSprintMeta,
    overviewCompletion,
    storeFilters.team,
    teamName,
    dimensions.projects,
  ]);

  const deliveryVerdict = useMemo(() => {
    if (!snapshot) return null;
    // Prefer Overview leaf (sprint/team-aware) so the banner tracks the top-bar sprint.
    const blocked =
      metricValue(deliveryConfidence.metrics, "blocked") ?? snapshot.kpis.blocked;
    const completion =
      metricValue(deliveryConfidence.metrics, "completion") ??
      activeSprintCards[0]?.pct ??
      snapshot.kpis.sprintCompletionPct;
    return buildDeliveryConfidenceOneLiner({
      healthScore: deliveryConfidence.score,
      blocked,
      overdue: snapshot.kpis.overdue,
      sprintCompletionPct: completion,
    });
  }, [snapshot, deliveryConfidence, activeSprintCards]);

  const syncMeta =
    loadState === "ready" && syncedAt
      ? `last synced ${formatRelative(syncedAt)}`
      : lastSyncedAt
        ? `last synced ${formatRelative(lastSyncedAt)}`
        : "evidence set";

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
              deepLink={{
                search: { key: "riskFocus", value: "blockers" },
              }}
            />
          )}

          <ScoreDerivationPanel derivation={deliveryConfidence.derivation} />

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
              <SprintCards sprints={activeSprintCards} siteUrl={snapshot.siteUrl} />
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

function metricValue(
  metrics: Array<{ id: string; value: number | string }>,
  id: string,
): number | null {
  const raw = metrics.find((m) => m.id === id)?.value;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw.replace(/%/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
