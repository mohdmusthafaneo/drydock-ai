/**
 * Structural shape shared by TPT / Connexus overview derived packs.
 * Generators emit `as const`; consumers cast or pass through factories.
 */
export type OverviewDerivedSprint = {
  id: string;
  name: string;
  startLabel: string;
  endLabel: string;
  rangeLabel: string;
  start: string;
  end: string;
};

export type OverviewDerivedTeam = {
  key: string;
  name: string;
};

export type OverviewDerivedPack = {
  lastSyncAt: string;
  orgName: string;
  projectKey: string;
  defaultSprintId: string;
  teams: ReadonlyArray<OverviewDerivedTeam>;
  sprints: ReadonlyArray<OverviewDerivedSprint>;
  base: Record<string, unknown> & { charts?: Record<string, unknown> };
  byTeam: Record<string, unknown>;
  bySprint: Record<string, { kpis: unknown; charts: unknown }>;
  byTeamSprint: Record<string, unknown>;
  scheduleRiskBySprint: Record<string, unknown>;
  scheduleRiskByTeamSprint: Record<string, unknown>;
  jiraSiteUrl: string;
  deliveryBySprint: Record<string, unknown>;
  deliveryByTeamSprint: Record<string, unknown>;
};

/** Previous sprint id when packs list newest-first (default → older). */
export function previousSprintId(
  derived: OverviewDerivedPack,
  sprintId: string,
): string | null {
  const ids = derived.sprints.map((s) => s.id);
  const idx = ids.indexOf(sprintId);
  if (idx < 0 || idx >= ids.length - 1) return null;
  return ids[idx + 1] ?? null;
}
