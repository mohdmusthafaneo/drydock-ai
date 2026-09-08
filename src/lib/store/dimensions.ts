import { deepMerge, type DeepPartial } from "@/lib/store/deep";

export type TeamKey = string;
export type SprintId = string;

export type AppFilters = {
  team: TeamKey | null;
  sprint: SprintId | null;
  /** Surface-local filters kept in the store for cross-page coherence. */
  projectKey: string | null;
  riskFocus: string | null;
  range: string | null;
  compare: string | null;
  repos: string[];
  branch: string | null;
  author: string | null;
  serviceId: string | null;
  environment: string | null;
  observabilitySource: "prometheus" | "grafana" | null;
  auditCategory: string | null;
};

export const DEFAULT_FILTERS: AppFilters = {
  team: null,
  sprint: null,
  projectKey: null,
  riskFocus: null,
  range: null,
  compare: null,
  repos: [],
  branch: null,
  author: null,
  serviceId: null,
  environment: null,
  observabilitySource: null,
  auditCategory: null,
};

/**
 * A value that can vary by team, sprint, or both.
 * Precedence when resolving: byTeamSprint > byTeam > bySprint > base.
 */
export type Dimensioned<T> = {
  base: T;
  byTeam?: Partial<Record<TeamKey, DeepPartial<T>>>;
  bySprint?: Partial<Record<SprintId, DeepPartial<T>>>;
  /** Keyed as `"TEAM:sprintId"` e.g. `"WEB:37"`. */
  byTeamSprint?: Record<string, DeepPartial<T>>;
};

export function teamSprintKey(team: TeamKey, sprint: SprintId): string {
  return `${team}:${sprint}`;
}

export function resolve<T>(
  dimensioned: Dimensioned<T>,
  filters: Pick<AppFilters, "team" | "sprint">,
): T {
  let result = dimensioned.base;

  if (filters.sprint && dimensioned.bySprint?.[filters.sprint]) {
    result = deepMerge(result, dimensioned.bySprint[filters.sprint]);
  }

  if (filters.team && dimensioned.byTeam?.[filters.team]) {
    result = deepMerge(result, dimensioned.byTeam[filters.team]);
  }

  if (filters.team && filters.sprint && dimensioned.byTeamSprint) {
    const key = teamSprintKey(filters.team, filters.sprint);
    const cell = dimensioned.byTeamSprint[key];
    if (cell) result = deepMerge(result, cell);
  }

  return result;
}

/** Convenience: wrap a plain value as Dimensioned with only `base`. */
export function asDimensioned<T>(base: T): Dimensioned<T> {
  return { base };
}
