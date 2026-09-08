import { resolve } from "@/lib/store/dimensions";
import type {
  AppStoreState,
  OverviewDashboardModel,
  OverviewSprintOption,
} from "@/lib/store/types";

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function sprintChipLabel(sprint: OverviewSprintOption): string {
  return `${sprint.name} | ${sprint.startLabel} – ${sprint.endLabel}`;
}

/**
 * Resolve filter-aware Overview leaf into a full OverviewDashboardModel
 * with shell fields (greeting, sprint picker, teams, lastSyncAt).
 */
export function selectOverviewModel(state: AppStoreState): OverviewDashboardModel {
  const { data, filters } = state;
  const sprintId = filters.sprint ?? "37";
  const leaf = resolve(data.overview, {
    team: filters.team,
    sprint: sprintId,
  });

  const sprint =
    data.dimensions.sprints.find((s) => s.id === sprintId) ??
    data.dimensions.sprints.find((s) => s.id === "37") ??
    data.dimensions.sprints[0]!;

  const caption = leaf.deliveryConfidence.caption.replace(
    /Sprint \d+/g,
    sprint.name,
  );

  return {
    greetingName: data.user.greetingName,
    greeting: greetingForHour(new Date().getHours()),
    sprint: {
      id: sprint.id,
      name: sprint.name,
      startLabel: sprint.startLabel,
      endLabel: sprint.endLabel,
      rangeLabel: sprint.rangeLabel,
    },
    sprints: data.dimensions.sprints,
    teamKey: filters.team,
    teams: data.dimensions.teams,
    deliveryConfidence: {
      ...leaf.deliveryConfidence,
      caption,
    },
    keyTakeaways: leaf.keyTakeaways,
    pillars: leaf.pillars,
    deliveryTrend: leaf.deliveryTrend,
    burndown: leaf.burndown,
    heatmap: leaf.heatmap,
    attention: leaf.attention,
    leadership: leaf.leadership,
    lastSyncAt: data.meta.lastSyncAt,
    empty: leaf.empty,
  };
}

export type ShellChrome = {
  organizationName: string;
  projects: { key: string; name: string }[];
  lastSyncAt: string | null;
  sprints: Array<{ id: string; label: string; start: string; end: string }>;
  activeSprintLabel: string | undefined;
};

/** TopBar / Sidebar chrome derived from AppData + filters. */
export function selectShellChrome(state: AppStoreState): ShellChrome {
  const { data, filters } = state;
  const sprintId = filters.sprint ?? "37";
  const active =
    data.dimensions.sprints.find((s) => s.id === sprintId) ??
    data.dimensions.sprints.find((s) => s.id === "37");

  return {
    organizationName: data.org.name,
    projects: data.dimensions.projects,
    lastSyncAt: data.meta.lastSyncAt,
    sprints: data.dimensions.sprints.map((s) => ({
      id: s.id,
      label: sprintChipLabel(s),
      start: s.start,
      end: s.end,
    })),
    activeSprintLabel: active ? sprintChipLabel(active) : undefined,
  };
}

/** AI code risk % for the active team filter (org default when unfiltered). */
export function selectAiRiskPct(state: AppStoreState): number {
  const { data, filters } = state;
  const { aiRiskPctByTeam, defaultAiRiskPct } = data.codeAnalysis;
  if (filters.team && aiRiskPctByTeam[filters.team] != null) {
    return aiRiskPctByTeam[filters.team]!;
  }
  return defaultAiRiskPct;
}
