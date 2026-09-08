import { formatSprintDay } from "@/lib/format-date";
import { sprintDaysOverdue } from "@/lib/jira-sprint-metrics";
import type { DeliveryAnalysisSprintRow } from "@/lib/delivery-analysis/types";

export type SelectedSprintMeta = {
  id: string;
  name: string;
  start: string;
  end: string;
};

export type OverviewSprintCompletion = {
  done: number;
  total: number;
  pct: number;
};

/** @deprecated Prefer formatSprintDay from format-date — kept as sprint-display alias. */
export const formatSprintDate = formatSprintDay;

function normalizeSprintName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sprintMatchesSelection(
  row: DeliveryAnalysisSprintRow,
  selected: Pick<SelectedSprintMeta, "id" | "name">,
): boolean {
  if (row.sprintId != null && String(row.sprintId) === selected.id) return true;
  return normalizeSprintName(row.name) === normalizeSprintName(selected.name);
}

function daysUntilEnd(endDate: string | undefined): number | null {
  if (!endDate) return null;
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((end.getTime() - todayUtc) / 86400000);
}

/**
 * Severity from completion + calendar position (aligned with delivery-health signals).
 * Recomputes overdue from endDate — do not trust a stale synced daysOverdue.
 */
export function computeSprintCardSeverity(input: {
  pct: number;
  endDate?: string;
  state: string;
  daysOverdue: number;
}): DeliveryAnalysisSprintRow["severity"] {
  const { pct, endDate, state, daysOverdue } = input;
  const active = state === "active";

  let severity: DeliveryAnalysisSprintRow["severity"] =
    pct < 40 ? "critical" : pct < 60 ? "warning" : "info";

  if (active && daysOverdue > 0) {
    return daysOverdue >= 5 || pct < 60 ? "critical" : "warning";
  }

  if (active && endDate) {
    const left = daysUntilEnd(endDate);
    if (left != null && left < 3 && pct < 50) return "critical";
    // Plenty of runway: soft-pedal pct-only warnings.
    if (left != null && left >= 5 && pct >= 40 && pct < 60) return "info";
  }

  return severity;
}

export function enrichSprintRow(row: DeliveryAnalysisSprintRow): DeliveryAnalysisSprintRow {
  const active = row.state === "active";
  const daysOverdue = active ? sprintDaysOverdue(row.endDate) : 0;
  return {
    ...row,
    daysOverdue: daysOverdue > 0 ? daysOverdue : undefined,
    severity: computeSprintCardSeverity({
      pct: row.pct,
      endDate: row.endDate,
      state: row.state,
      daysOverdue,
    }),
  };
}

function applyOverviewCounts(
  row: DeliveryAnalysisSprintRow,
  completion: OverviewSprintCompletion | null,
): DeliveryAnalysisSprintRow {
  if (!completion || completion.total <= 0) return row;
  return {
    ...row,
    done: completion.done,
    committed: completion.total,
    pct: completion.pct,
  };
}

function synthesizeFromOverview(
  selected: SelectedSprintMeta,
  completion: OverviewSprintCompletion,
  scope: { projectKey: string; projectName: string },
): DeliveryAnalysisSprintRow {
  const end = selected.end;
  const start = selected.start;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  let state = "active";
  if (end < todayKey) state = "closed";
  else if (start > todayKey) state = "future";

  return enrichSprintRow({
    projectKey: scope.projectKey,
    projectName: scope.projectName,
    name: selected.name,
    state,
    startDate: start,
    endDate: end,
    done: completion.done,
    committed: completion.total,
    pct: completion.pct,
    sprintId: Number.parseInt(selected.id, 10) || undefined,
  });
}

/**
 * Active-sprints card rows for the Overview-selected sprint/team context.
 * Prefers matching Delivery rows; otherwise synthesizes from Overview completion
 * so the card never silently shows an unrelated Connexus/active sprint.
 */
export function resolveActiveSprintCards(input: {
  sprints: DeliveryAnalysisSprintRow[];
  selectedSprint: SelectedSprintMeta | null;
  overviewCompletion: OverviewSprintCompletion | null;
  teamKey: string | null;
  teamName: string | null;
  /** Org / project label when no team filter. */
  fallbackProjectKey?: string;
  fallbackProjectName?: string;
}): DeliveryAnalysisSprintRow[] {
  const {
    sprints,
    selectedSprint,
    overviewCompletion,
    teamKey,
    teamName,
    fallbackProjectKey = "ORG",
    fallbackProjectName = "Organization",
  } = input;

  const scope = {
    projectKey: teamKey ?? fallbackProjectKey,
    projectName: teamName ?? fallbackProjectName,
  };

  if (selectedSprint) {
    let matched = sprints.filter((s) => sprintMatchesSelection(s, selectedSprint));
    if (teamKey) {
      const forTeam = matched.filter((s) => s.projectKey === teamKey);
      if (forTeam.length > 0) matched = forTeam;
      else if (overviewCompletion && overviewCompletion.total > 0) {
        // Team filter with org-only sprint rows — prefer Overview team leaf.
        return [synthesizeFromOverview(selectedSprint, overviewCompletion, scope)];
      }
    } else if (matched.length > 1) {
      // Prefer a single org-level row when several projects share the sprint name.
      matched = [matched[0]!];
    }

    if (matched.length > 0) {
      return matched.map((row) =>
        enrichSprintRow({
          ...applyOverviewCounts(
            {
              ...row,
              startDate: row.startDate ?? selectedSprint.start,
              endDate: row.endDate ?? selectedSprint.end,
              name: selectedSprint.name,
              ...(teamKey
                ? { projectKey: scope.projectKey, projectName: scope.projectName }
                : {}),
            },
            overviewCompletion,
          ),
        }),
      );
    }

    if (overviewCompletion && overviewCompletion.total > 0) {
      return [synthesizeFromOverview(selectedSprint, overviewCompletion, scope)];
    }

    return [
      enrichSprintRow({
        projectKey: scope.projectKey,
        projectName: scope.projectName,
        name: selectedSprint.name,
        state: "active",
        startDate: selectedSprint.start,
        endDate: selectedSprint.end,
        done: 0,
        committed: 0,
        pct: 0,
      }),
    ];
  }

  const active = sprints.filter((s) => s.state === "active");
  const pool = active.length > 0 ? active : sprints;
  return pool.map((row) =>
    enrichSprintRow(applyOverviewCounts(row, overviewCompletion)),
  );
}
