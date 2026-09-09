"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { ScheduleRiskPanel } from "@/components/delivery-analysis/schedule-risk-panel";
import {
  JiraHygieneBanner,
  JiraHygieneFindingsCard,
} from "@/components/delivery-analysis/jira-hygiene-banner";
import { AnalysisTabs } from "@/components/delivery-analysis/analysis-tabs";
import { ScoreDerivationPanel } from "@/components/delivery-analysis/score-derivation-panel";
import { SnapshotUnavailable } from "@/components/delivery-analysis/snapshot-unavailable";
import {
  selectDeliveryAnalysisSnapshot,
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

function keepScopedRows<T>(rows: T[], matches: (row: T) => boolean): T[] {
  const matching = rows.filter(matches);
  // Team keys are not Jira project keys — keep org-level sprints/versions.
  return matching.length > 0 ? matching : rows;
}

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
  let next = snapshot;

  if (filters.projectKey) {
    const byProject = snapshot.byProject.filter((p) => p.key === filters.projectKey);
    if (byProject.length === 0) {
      return { ...snapshot, byProject: [], projectKeys: [] };
    }

    const project = byProject[0]!;
    const scheduleItems = snapshot.scheduleRisk?.items?.filter(
      (item) => item.teamKey === filters.projectKey,
    );
    next = {
      ...snapshot,
      projectKeys: [project.key],
      byProject,
      sprints: keepScopedRows(
        snapshot.sprints,
        (s) => s.projectKey === project.key,
      ),
      versions: keepScopedRows(
        snapshot.versions,
        (v) => v.projectKey === project.key,
      ),
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
      scheduleRisk: snapshot.scheduleRisk
        ? {
            ...snapshot.scheduleRisk,
            total:
              scheduleItems && scheduleItems.length > 0
                ? scheduleItems.length
                : snapshot.scheduleRisk.byTeam.find((t) => t.key === filters.projectKey)
                    ?.count ?? snapshot.scheduleRisk.total,
            byTeam: snapshot.scheduleRisk.byTeam.filter(
              (t) => t.key === filters.projectKey,
            ),
          }
        : undefined,
    };
  }

  if (filters.riskFocus !== "all") {
    next = {
      ...next,
      signals: next.signals.filter((s) => s.category === filters.riskFocus),
      gaps:
        filters.riskFocus === "schedule"
          ? next.gaps.filter((g) => /schedule|spill|overdue|version/i.test(`${g.area} ${g.gap}`))
          : filters.riskFocus === "blockers"
            ? next.gaps.filter((g) => /block/i.test(`${g.area} ${g.gap}`))
            : next.gaps,
    };
  }

  return next;
}

export function DeliveryAnalysisDashboard({
  projectKeys,
  lastSyncedAt,
  initialProjectKey = null,
}: Props) {
  const storeSnapshot = useAppData((s) => selectDeliveryAnalysisSnapshot(s));
  const organizationName = useAppData((s) => s.data.org.name);
  const overviewModel = useAppData((s) => selectOverviewModel(s));
  const deliveryConfidence = overviewModel.deliveryConfidence;
  const dimensions = useAppData((s) => s.data.dimensions);
  const storeFilters = useFilters();
  const setFilter = useSetFilter();
  const searchParams = useSearchParams();

  const effectiveSprintId =
    storeFilters.sprint ??
    dimensions.defaultSprintId ??
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
      riskFocus: parseRiskFocus(
        storeFilters.riskFocus ?? searchParams.get("riskFocus"),
      ),
      range: (storeFilters.range as TimeRange | null) ?? "30d",
      compare: (storeFilters.compare as CompareMode | null) ?? "previous_sync",
    }),
    [
      deliveryProjectKey,
      storeFilters.riskFocus,
      searchParams,
      storeFilters.range,
      storeFilters.compare,
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

  const activeSprintCards = useMemo(() => {
    if (!snapshot) return [];
    const orgKey =
      snapshot.sprints[0]?.projectKey ??
      dimensions.projects[0]?.key ??
      snapshot.projectKeys[0] ??
      "";
    const orgName =
      snapshot.sprints[0]?.projectName ??
      dimensions.projects[0]?.name ??
      organizationName;
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
    organizationName,
  ]);

  const deliveryVerdict = useMemo(() => {
    if (!snapshot) return null;
    return buildDeliveryConfidenceOneLiner({
      healthScore: snapshot.kpis.healthScore,
      blocked: snapshot.kpis.blocked,
      overdue: snapshot.kpis.overdue,
      sprintCompletionPct:
        activeSprintCards[0]?.pct ?? snapshot.kpis.sprintCompletionPct,
    });
  }, [snapshot, activeSprintCards]);

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

          {snapshot.scheduleRisk &&
            snapshot.scheduleRisk.total > 0 &&
            filters.riskFocus === "schedule" && (
              <ScheduleRiskPanel
                risk={snapshot.scheduleRisk}
                organizationName={organizationName}
                deepLink
              />
            )}

          {deliveryConfidence.derivation && (
            <ScoreDerivationPanel derivation={deliveryConfidence.derivation} />
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
